import { useCallback } from 'react';
import { useSimStore } from '../store/simStore';
import { useUIStore } from '../store/uiStore';
import { useTacticalStore } from '../tactical/store/tacticalStore';
import { simulationRunner } from '../engine/worker';
import { armyToTacticalUnits, regionToTacticalMap, autoResolveTacticalBattle } from '../tactical/bridge';
import type { PendingTacticalBattle } from '../tactical/bridge';
import { useMapStore } from '../store/mapStore';

/**
 * Modal prompt shown when a strategic battle can be resolved tactically.
 * Player can choose: Resolve Tactically, Auto-Resolve, or Skip.
 */
export default function TacticalBattlePrompt() {
  const pendingBattle = useSimStore((s) => s.pendingTacticalBattle);
  const setPendingTacticalBattle = useSimStore((s) => s.setPendingTacticalBattle);
  const setStatus = useSimStore((s) => s.setStatus);
  const setGameMode = useUIStore((s) => s.setGameMode);
  const map = useMapStore((s) => s.map);

  const handleResolveTactically = useCallback(() => {
    if (!pendingBattle || !map) return;

    // Find the armies from the map store
    const attackerCountry = map.countries.find((c) => c.id === pendingBattle.attackerCountryId);
    const defenderCountry = map.countries.find((c) => c.id === pendingBattle.defenderCountryId);
    const region = map.regions.find((r) => r.id === pendingBattle.regionId);
    if (!attackerCountry || !defenderCountry || !region) return;

    const attackerArmy = attackerCountry.activeArmies.find((a) => a.id === pendingBattle.attackerArmyId);
    const defenderArmy = defenderCountry.activeArmies.find((a) => a.id === pendingBattle.defenderArmyId);
    if (!attackerArmy || !defenderArmy) return;

    // Generate tactical map from region
    const tacticalMap = regionToTacticalMap(region, pendingBattle.strategicTick);

    // Convert armies to tactical units
    const attackerUnits = armyToTacticalUnits(attackerArmy, 'attacker', tacticalMap.width, tacticalMap.height);
    const defenderUnits = armyToTacticalUnits(defenderArmy, 'defender', tacticalMap.width, tacticalMap.height);
    const allUnits = [...attackerUnits, ...defenderUnits];

    // Store the battle context in the tactical store for result handling
    const tacticalStore = useTacticalStore.getState();
    tacticalStore.initGame(tacticalMap, allUnits, 'attacker');

    // Save battle context for when tactical battle finishes
    useTacticalStore.setState({
      strategicBattleId: pendingBattle.id,
      strategicAttackerArmy: attackerArmy,
      strategicDefenderArmy: defenderArmy,
    });

    // Switch to tactical mode
    setGameMode('tactical');
    setPendingTacticalBattle(null);
  }, [pendingBattle, map, setGameMode, setPendingTacticalBattle]);

  const handleAutoResolve = useCallback(() => {
    if (!pendingBattle || !map) return;

    const attackerCountry = map.countries.find((c) => c.id === pendingBattle.attackerCountryId);
    const defenderCountry = map.countries.find((c) => c.id === pendingBattle.defenderCountryId);
    if (!attackerCountry || !defenderCountry) return;

    const attackerArmy = attackerCountry.activeArmies.find((a) => a.id === pendingBattle.attackerArmyId);
    const defenderArmy = defenderCountry.activeArmies.find((a) => a.id === pendingBattle.defenderArmyId);
    if (!attackerArmy || !defenderArmy) return;

    const pending: PendingTacticalBattle = {
      ...pendingBattle,
      attackerArmy,
      defenderArmy,
    };

    const result = autoResolveTacticalBattle(pending);

    // Apply result to simulation
    simulationRunner.applyTacticalResult(
      result.battleId,
      result.attackerWins,
      result.attackerSurvivalRate,
      result.defenderSurvivalRate,
    );

    setPendingTacticalBattle(null);
    setStatus('running');
    simulationRunner.resume();
  }, [pendingBattle, map, setPendingTacticalBattle, setStatus]);

  const handleSkip = useCallback(() => {
    // Just dismiss and resume — the border front will resolve normally
    setPendingTacticalBattle(null);
    setStatus('running');
    simulationRunner.resume();
  }, [setPendingTacticalBattle, setStatus]);

  if (!pendingBattle) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-gray-700">
        <h2 className="text-lg font-bold text-yellow-400 mb-3">Battle Engagement!</h2>
        <p className="text-sm text-gray-300 mb-4">
          <span style={{ color: pendingBattle.attackerColor }} className="font-bold">
            {pendingBattle.attackerName}
          </span>{' '}
          is attacking{' '}
          <span style={{ color: pendingBattle.defenderColor }} className="font-bold">
            {pendingBattle.defenderName}
          </span>{' '}
          at Region #{pendingBattle.regionId} ({pendingBattle.terrain}).
        </p>

        <p className="text-xs text-gray-400 mb-5">
          How would you like to resolve this battle?
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleResolveTactically}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            Resolve Tactically
            <span className="block text-xs text-purple-200 mt-0.5">
              Play the battle in tactical combat mode
            </span>
          </button>

          <button
            onClick={handleAutoResolve}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            Auto-Resolve
            <span className="block text-xs text-blue-200 mt-0.5">
              Calculate result instantly and continue
            </span>
          </button>

          <button
            onClick={handleSkip}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded text-sm transition-colors"
          >
            Skip (Standard Combat)
            <span className="block text-xs text-gray-400 mt-0.5">
              Let the border front combat resolve normally
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
