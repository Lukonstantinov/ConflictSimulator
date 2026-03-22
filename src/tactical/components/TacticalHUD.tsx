import { useTacticalStore } from '../store/tacticalStore';

export default function TacticalHUD() {
  const units = useTacticalStore((s) => s.units);
  const selectedUnitIds = useTacticalStore((s) => s.selectedUnitIds);
  const tick = useTacticalStore((s) => s.tick);
  const status = useTacticalStore((s) => s.status);

  const selectedUnits = units.filter((u) => selectedUnitIds.includes(u.id));

  const attackerAlive = units.filter((u) => u.faction === 'attacker' && u.state !== 'destroyed').length;
  const defenderAlive = units.filter((u) => u.faction === 'defender' && u.state !== 'destroyed').length;
  const totalAttacker = units.filter((u) => u.faction === 'attacker').length;
  const totalDefender = units.filter((u) => u.faction === 'defender').length;

  return (
    <>
      {/* Unit counts - top left */}
      <div className="absolute top-2 left-2 bg-gray-800 bg-opacity-90 rounded px-3 py-2 text-xs">
        <div className="flex gap-4">
          <div>
            <span className="text-blue-400">ATK:</span> {attackerAlive}/{totalAttacker}
          </div>
          <div>
            <span className="text-red-400">DEF:</span> {defenderAlive}/{totalDefender}
          </div>
          <div className="text-gray-400">Tick: {tick}</div>
        </div>
      </div>

      {/* Victory/Defeat banner */}
      {(status === 'victory' || status === 'defeat') && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className={`text-4xl font-bold px-8 py-4 rounded-lg ${
            status === 'victory' ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'
          }`}>
            {status === 'victory' ? 'VICTORY' : 'DEFEAT'}
          </div>
        </div>
      )}

      {/* Selected unit info - bottom left */}
      {selectedUnits.length > 0 && (
        <div className="absolute bottom-2 left-2 bg-gray-800 bg-opacity-90 rounded px-3 py-2 text-xs max-w-xs">
          {selectedUnits.length === 1 ? (
            <SingleUnitInfo unit={selectedUnits[0]} />
          ) : (
            <div>
              <p className="text-gray-300 font-bold mb-1">{selectedUnits.length} units selected</p>
              {selectedUnits.map((u) => (
                <div key={u.id} className="flex gap-2 text-gray-400">
                  <span className="capitalize">{u.type}</span>
                  {u.type === 'infantry' ? (
                    <span>Squad: {u.squadSize}/{u.maxSquadSize}</span>
                  ) : (
                    <span>HP: {Math.round(u.health)}%</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function SingleUnitInfo({ unit }: { unit: ReturnType<typeof useTacticalStore.getState>['units'][0] }) {
  return (
    <div>
      <p className="font-bold capitalize text-gray-200">{unit.type}</p>
      <p className="text-gray-400">
        Faction: <span className={unit.faction === 'attacker' ? 'text-blue-400' : 'text-red-400'}>
          {unit.faction}
        </span>
      </p>
      {unit.type === 'infantry' ? (
        <p>Squad: {unit.squadSize}/{unit.maxSquadSize}</p>
      ) : (
        <p>Health: {Math.round(unit.health)}%</p>
      )}
      <p>Morale: {Math.round(unit.morale)}%</p>
      <p className="capitalize">State: {unit.state}</p>
      <p>Range: {unit.stats.range} | Speed: {unit.stats.speed}</p>
      <p>Damage: {unit.stats.damage} | Armor: {Math.round(unit.stats.armor * 100)}%</p>
    </div>
  );
}
