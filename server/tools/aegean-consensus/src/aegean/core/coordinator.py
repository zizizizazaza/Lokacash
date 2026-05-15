"""
Consensus coordinator - the core of the Aegean protocol.

Based on paper Algorithm 1 (Section 5)
"""

import asyncio
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional
from datetime import datetime
import logging

from aegean.core.agent import Agent, AgentRegistry
from aegean.core.models import (
    Solution,
    ConsensusState,
    ConsensusResult,
    ConsensusConfig,
    ConsensusStatus,
)
from aegean.core.decision_engine import DecisionEngine, DefaultDecisionEngine

logger = logging.getLogger(__name__)

# Optional callback for live progress streaming. Awaited on each event so
# upstream SSE producers can flush per-event without a buffering delay.
EventSink = Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]]


class ConsensusCoordinator:
    """
    Consensus coordinator implementing the Aegean protocol.
    
    Based on paper Algorithm 1:
    1. Leader election
    2. Initial solution collection
    3. Refinement loop with quorum detection
    4. Stability tracking and early termination
    
    Attributes:
        agent_registry: Registry of available agents
        config: Consensus configuration
        decision_engine: Engine for evaluating consensus
    """

    def __init__(
        self,
        agent_registry: AgentRegistry,
        config: Optional[ConsensusConfig] = None,
        decision_engine: Optional[DecisionEngine] = None,
    ):
        """
        Initialize consensus coordinator.
        
        Args:
            agent_registry: Registry containing available agents
            config: Consensus configuration (uses defaults if None)
            decision_engine: Custom decision engine (uses default if None)
        """
        self.agent_registry = agent_registry
        self.config = config or ConsensusConfig()
        self.state: Optional[ConsensusState] = None
        
        # Initialize decision engine
        if decision_engine is None:
            self.decision_engine = DefaultDecisionEngine(
                quorum_size=self.config.quorum_size,
                stability_horizon=self.config.stability_horizon,
            )
        else:
            self.decision_engine = decision_engine

    async def run_consensus(
        self,
        task: str,
        consensus_id: Optional[str] = None,
        event_sink: EventSink = None,
    ) -> ConsensusResult:
        """
        Execute the consensus protocol on a task.

        This is the main entry point implementing Algorithm 1 from the paper.

        Args:
            task: The task description to solve
            consensus_id: Optional unique ID for this consensus execution
            event_sink: Optional async callback ``await event_sink(event_type, payload)``
                        invoked on key milestones (leader_elected, agent_completed,
                        round_completed, consensus_reached). Used by SSE producers
                        to stream live progress to the frontend without waiting
                        for the whole consensus to finish.

        Returns:
            ConsensusResult with final solution and execution details
        """
        # Initialize
        consensus_id = consensus_id or str(uuid.uuid4())
        start_time = datetime.now()

        async def _emit(event_type: str, payload: Dict[str, Any]) -> None:
            if event_sink is None:
                return
            try:
                await event_sink(event_type, {"consensus_id": consensus_id, **payload})
            except Exception as exc:  # never let the sink break the loop
                logger.warning(f"event_sink raised on {event_type}: {exc}")

        logger.info(f"Starting consensus {consensus_id} for task: {task[:50]}...")
        await _emit("consensus_started", {"task_preview": task[:120]})

        # Create initial state
        state = ConsensusState(
            consensus_id=consensus_id,
            status=ConsensusStatus.INITIALIZING,
        )
        self.state = state

        try:
            # Step 1: Leader election (Algorithm 1, Line 2-3)
            state.status = ConsensusStatus.ELECTING_LEADER
            leader = await self._elect_leader()
            state.leader_id = leader.agent_id
            logger.info(f"Leader elected: {leader.agent_id}")
            await _emit("leader_elected", {"agent_id": leader.agent_id})

            # Step 2: Collect initial solutions (Algorithm 1, Line 4-6)
            state.status = ConsensusStatus.COLLECTING_INITIAL
            agents = self.agent_registry.get_all_agents()
            state.participating_agents = [a.agent_id for a in agents]
            await _emit("round_started", {"round_number": 1, "is_refinement": False})

            initial_solutions = await self._collect_initial_solutions(
                agents, task, _emit_per_agent=_emit, round_number=1
            )
            state.solutions_history.append(initial_solutions)
            state.current_round = 1
            await _emit("round_completed", {"round_number": 1, "solution_count": len(initial_solutions)})
            
            logger.info(
                f"Collected {len(initial_solutions)} initial solutions "
                f"(quorum: {self.config.quorum_size})"
            )
            
            # Step 3: Refinement loop (Algorithm 1, Line 7-12)
            state.status = ConsensusStatus.REFINING
            refinement_set = initial_solutions

            while state.current_round <= self.config.max_rounds:
                logger.info(f"Starting refinement round {state.current_round}")

                # Evaluate current solutions
                candidate, should_terminate = self.decision_engine.evaluate(
                    solutions=refinement_set,
                    round_num=state.current_round,
                    previous_candidate=state.candidate_solution,
                )

                # Update state
                if candidate:
                    state.candidate_solution = candidate
                    state.stability_counter = self.decision_engine.stability_counter
                    logger.info(
                        f"Candidate: {candidate.answer} "
                        f"(stability: {state.stability_counter}/{self.config.stability_horizon})"
                    )

                # Check termination
                if should_terminate:
                    state.status = ConsensusStatus.CONSENSUS_REACHED
                    logger.info(f"Consensus reached after {state.current_round} rounds")
                    break

                # Check max rounds
                if state.current_round >= self.config.max_rounds:
                    logger.warning(f"Max rounds ({self.config.max_rounds}) reached")
                    break

                # Refine solutions for next round
                state.current_round += 1
                next_round = state.current_round
                await _emit("round_started", {"round_number": next_round, "is_refinement": True})
                refinement_set = await self._refine_solutions(
                    agents, refinement_set, _emit_per_agent=_emit, round_number=next_round
                )
                state.solutions_history.append(refinement_set)
                await _emit("round_completed", {"round_number": next_round, "solution_count": len(refinement_set)})

            # Build result
            state.completed_at = datetime.now()
            execution_time = (state.completed_at - start_time).total_seconds()
            
            result = ConsensusResult(
                consensus_id=consensus_id,
                success=state.status == ConsensusStatus.CONSENSUS_REACHED,
                final_solution=state.candidate_solution,
                rounds_used=state.current_round,
                participating_agents=state.participating_agents,
                execution_time=execution_time,
                consensus_reached=state.status == ConsensusStatus.CONSENSUS_REACHED,
            )
            
            logger.info(
                f"Consensus completed: success={result.success}, "
                f"rounds={result.rounds_used}, time={execution_time:.2f}s"
            )
            await _emit(
                "consensus_completed",
                {
                    "success": result.success,
                    "rounds_used": result.rounds_used,
                    "consensus_reached": result.consensus_reached,
                    "execution_time": execution_time,
                },
            )

            return result

        except Exception as e:
            logger.error(f"Consensus failed: {e}", exc_info=True)
            state.status = ConsensusStatus.FAILED
            state.completed_at = datetime.now()
            
            return ConsensusResult(
                consensus_id=consensus_id,
                success=False,
                final_solution=None,
                rounds_used=state.current_round,
                participating_agents=state.participating_agents,
                execution_time=(state.completed_at - start_time).total_seconds(),
                consensus_reached=False,
                error_message=str(e),
            )

    async def _elect_leader(self) -> Agent:
        """
        Elect a leader agent.
        
        Simple implementation: select first agent.
        Can be extended to implement proper leader election (Raft, etc.)
        
        Returns:
            The elected leader agent
        """
        agents = self.agent_registry.get_all_agents()
        if not agents:
            raise ValueError("No agents available for leader election")
        
        # Simple: first agent is leader
        # TODO: Implement proper leader election protocol
        return agents[0]

    async def _collect_initial_solutions(
        self,
        agents: List[Agent],
        task: str,
        *,
        _emit_per_agent: EventSink = None,
        round_number: int = 1,
    ) -> List[Solution]:
        """
        Collect initial solutions from agents with early termination.

        Based on paper Section 6: Early Termination
        - Collect solutions concurrently
        - Stop after quorum_size responses (cancel remaining)

        Args:
            agents: List of agents to query
            task: The task to solve
            _emit_per_agent: Optional sink fired per-agent on completion.
            round_number: Round index for the emitted events (always 1 for initial).

        Returns:
            List of solutions (at least quorum_size)
        """
        if self.config.enable_early_termination:
            return await self._collect_with_early_termination(
                agents, task, is_refinement=False,
                _emit_per_agent=_emit_per_agent, round_number=round_number,
            )
        else:
            # Collect from all agents (barrier synchronization)
            tasks = [agent.generate_solution(task) for agent in agents]
            return await asyncio.gather(*tasks)

    async def _refine_solutions(
        self,
        agents: List[Agent],
        refinement_set: List[Solution],
        *,
        _emit_per_agent: EventSink = None,
        round_number: int = 0,
    ) -> List[Solution]:
        """
        Refine solutions based on previous round.

        Args:
            agents: List of agents
            refinement_set: Solutions from previous round
            _emit_per_agent: Optional sink fired per-agent on completion.
            round_number: Round index for the emitted events.

        Returns:
            List of refined solutions
        """
        if self.config.enable_early_termination:
            return await self._collect_with_early_termination(
                agents, refinement_set, is_refinement=True,
                _emit_per_agent=_emit_per_agent, round_number=round_number,
            )
        else:
            # Collect from all agents
            tasks = [agent.refine_solution(refinement_set) for agent in agents]
            return await asyncio.gather(*tasks)

    async def _collect_with_early_termination(
        self,
        agents: List[Agent],
        input_data,  # task string or refinement_set
        is_refinement: bool,
        *,
        _emit_per_agent: EventSink = None,
        round_number: int = 0,
    ) -> List[Solution]:
        """
        Collect solutions with early termination optimization.
        
        Key optimization from paper Section 6:
        - Start all agents concurrently
        - Collect until quorum_size responses
        - Cancel remaining agents
        - Latency = max(fastest quorum_size agents)
        
        Args:
            agents: List of agents
            input_data: Task string or refinement set
            is_refinement: Whether this is a refinement round
            
        Returns:
            List of solutions (at least quorum_size)
        """
        solutions = []
        pending_tasks = []

        # Start all agents concurrently. Bind agent_id to each task so we can
        # emit per-agent completion events as they finish (vs. waiting for
        # the whole gather/quorum cycle).
        task_to_agent: Dict[asyncio.Task, Agent] = {}
        for agent in agents:
            if is_refinement:
                t = asyncio.create_task(agent.refine_solution(input_data))
            else:
                t = asyncio.create_task(agent.generate_solution(input_data))
            pending_tasks.append(t)
            task_to_agent[t] = agent

        async def _fire_agent_completed(agent_id: str, solution: Solution) -> None:
            if _emit_per_agent is None:
                return
            try:
                await _emit_per_agent(
                    "agent_completed",
                    {
                        "agent_id": agent_id,
                        "round_number": round_number,
                        "is_refinement": is_refinement,
                        "answer": getattr(solution, "answer", "") or "",
                        "confidence": float(getattr(solution, "confidence", 0.0) or 0.0),
                    },
                )
            except Exception as exc:
                logger.warning(f"_fire_agent_completed failed: {exc}")

        # Collect until quorum
        try:
            while len(solutions) < self.config.quorum_size and pending_tasks:
                # Wait for next completion
                done, pending_tasks = await asyncio.wait(
                    pending_tasks,
                    return_when=asyncio.FIRST_COMPLETED,
                )

                # Collect completed solutions
                for task in done:
                    agent_for_task = task_to_agent.get(task)
                    try:
                        solution = await task
                        solutions.append(solution)
                        if agent_for_task is not None:
                            await _fire_agent_completed(agent_for_task.agent_id, solution)
                    except Exception as e:
                        logger.warning(f"Agent failed: {e}")
                        if agent_for_task is not None and _emit_per_agent is not None:
                            try:
                                await _emit_per_agent(
                                    "agent_failed",
                                    {
                                        "agent_id": agent_for_task.agent_id,
                                        "round_number": round_number,
                                        "is_refinement": is_refinement,
                                        "error": str(e),
                                    },
                                )
                            except Exception:
                                pass
            
            # Early termination: cancel remaining tasks
            if pending_tasks:
                logger.info(f"Quorum reached, cancelling {len(pending_tasks)} slow agents")
                for task in pending_tasks:
                    task.cancel()
                
                # Wait for cancellations
                await asyncio.gather(*pending_tasks, return_exceptions=True)
        
        except Exception as e:
            # Cleanup on error
            for task in pending_tasks:
                task.cancel()
            raise e
        
        return solutions

    def get_state(self) -> dict:
        """Get current coordinator state for debugging."""
        return {
            "config": self.config.dict(),
            "decision_engine_state": self.decision_engine.get_state(),
            "agent_count": self.agent_registry.count(),
        }

