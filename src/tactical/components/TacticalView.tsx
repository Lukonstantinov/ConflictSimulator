import { useCallback, useRef, useEffect, useState } from 'react';
import TacticalCanvas from './TacticalCanvas';
import TacticalHUD from './TacticalHUD';
import TacticalControls from './TacticalControls';
import MapEditorPanel from './MapEditorPanel';
import KeyboardShortcuts from './KeyboardShortcuts';
import TutorialOverlay from './TutorialOverlay';
import { useTacticalStore } from '../store/tacticalStore';
import { TacticalEngine } from '../engine/TacticalEngine';
import { TACTICAL_SCENARIOS, loadScenario } from '../map/scenarios';
import { computeBattleResult } from '../bridge';
import { simulationRunner } from '../../engine/worker';
import { useUIStore } from '../../store/uiStore';
import { useSimStore } from '../../store/simStore';

export default function TacticalView() {
  const engineRef = useRef<TacticalEngine | null>(null);
  const status = useTacticalStore((s) => s.status);
  const map = useTacticalStore((s) => s.map);
  const initGame = useTacticalStore((s) => s.initGame);
  const updateState = useTacticalStore((s) => s.updateState);
  const setSpeed = useTacticalStore((s) => s.setSpeed);
  const playerFaction = useTacticalStore((s) => s.playerFaction);
  const editorMode = useTacticalStore((s) => s.editorMode);

  const strategicBattleId = useTacticalStore((s) => s.strategicBattleId);
  const strategicAttackerArmy = useTacticalStore((s) => s.strategicAttackerArmy);
  const strategicDefenderArmy = useTacticalStore((s) => s.strategicDefenderArmy);

  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [smokeMode, setSmokeMode] = useState(false);

  // Initialize scenario on mount (only if not launched from strategic mode)
  useEffect(() => {
    if (!map && !strategicBattleId) {
      const scenario = TACTICAL_SCENARIOS[scenarioIndex]();
      const { map: scenarioMap, units } = loadScenario(scenario);
      initGame(scenarioMap, units, 'attacker');
    }
  }, []);

  // Handle strategic battle result when tactical battle finishes
  useEffect(() => {
    if (!strategicBattleId || !strategicAttackerArmy || !strategicDefenderArmy) return;
    if (status !== 'victory' && status !== 'defeat') return;

    const units = useTacticalStore.getState().units;
    const result = computeBattleResult(
      strategicBattleId,
      units,
      strategicAttackerArmy,
      strategicDefenderArmy,
    );

    // Apply result to strategic simulation
    simulationRunner.applyTacticalResult(
      result.battleId,
      result.attackerWins,
      result.attackerSurvivalRate,
      result.defenderSurvivalRate,
    );
  }, [status, strategicBattleId, strategicAttackerArmy, strategicDefenderArmy]);

  const loadCurrentScenario = useCallback((faction: 'attacker' | 'defender', idx?: number) => {
    const scenario = TACTICAL_SCENARIOS[idx ?? scenarioIndex]();
    const { map: scenarioMap, units } = loadScenario(scenario);
    initGame(scenarioMap, units, faction);
  }, [initGame, scenarioIndex]);

  const handleStart = useCallback(() => {
    const state = useTacticalStore.getState();
    if (!state.map) return;

    const engine = new TacticalEngine(state.map, state.units, state.playerFaction);
    engineRef.current = engine;

    engine.setOnUpdate((engineState) => {
      updateState(engineState.units, engineState.tick, engineState.status, engineState.events);
    });

    engine.start();
    useTacticalStore.setState({ status: 'running' });
    setSmokeMode(false);
  }, [updateState]);

  const handlePause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.resume();
  }, []);

  const handleStop = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    setSmokeMode(false);
    loadCurrentScenario(playerFaction);
  }, [loadCurrentScenario, playerFaction]);

  const handleSpeedChange = useCallback((speed: number) => {
    setSpeed(speed);
    engineRef.current?.setSpeed(speed);
  }, [setSpeed]);

  const handleFactionChange = useCallback((faction: 'attacker' | 'defender') => {
    engineRef.current?.stop();
    engineRef.current = null;
    loadCurrentScenario(faction);
  }, [loadCurrentScenario]);

  const handleScenarioChange = useCallback((idx: number) => {
    engineRef.current?.stop();
    engineRef.current = null;
    setScenarioIndex(idx);
    const state = useTacticalStore.getState();
    loadCurrentScenario(state.playerFaction, idx);
  }, [loadCurrentScenario]);

  const handleMoveCommand = useCallback((unitIds: string[], target: { x: number; y: number }) => {
    if (smokeMode) {
      engineRef.current?.queueCommand({ type: 'smoke', unitIds, target });
      setSmokeMode(false);
      return;
    }
    engineRef.current?.queueCommand({ type: 'move', unitIds, target });
  }, [smokeMode]);

  const handleAttackCommand = useCallback((unitIds: string[], targetUnitId: string) => {
    const targetUnit = useTacticalStore.getState().units.find((u) => u.id === targetUnitId);
    if (!targetUnit) return;
    engineRef.current?.queueCommand({
      type: 'attack',
      unitIds,
      target: targetUnit.position,
      targetUnitId,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Keyboard shortcuts + help modal */}
      <KeyboardShortcuts
        onStart={handleStart}
        onPause={handlePause}
        onResume={handleResume}
        onSpeedChange={handleSpeedChange}
      />

      {/* Controls bar */}
      <div className="bg-gray-800 px-2 py-1.5 md:px-3 md:py-2 border-b border-gray-700 flex-shrink-0">
        <TacticalControls
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onSpeedChange={handleSpeedChange}
          onFactionChange={handleFactionChange}
          onScenarioChange={handleScenarioChange}
          scenarioIndex={scenarioIndex}
          smokeMode={smokeMode}
          onToggleSmokeMode={() => setSmokeMode(!smokeMode)}
        />
      </div>

      {/* Map + Editor Panel */}
      <div className="flex flex-1 min-h-0">
        <div className="relative flex-1 min-h-0">
          <TacticalCanvas
            onMoveCommand={handleMoveCommand}
            onAttackCommand={handleAttackCommand}
          />
          <TacticalHUD />
          {scenarioIndex === 0 && <TutorialOverlay />}
        </div>

        {/* Editor panel slides in when editorMode is on */}
        {editorMode && status === 'setup' && <MapEditorPanel />}
      </div>
    </div>
  );
}
