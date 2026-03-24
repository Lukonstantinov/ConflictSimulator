import { useState, useEffect } from 'react';
import { useTacticalStore } from '../store/tacticalStore';

/**
 * Shows contextual tutorial tips during the tutorial scenario.
 * Steps through: selection, movement, attack, victory.
 */
export default function TutorialOverlay() {
  const status = useTacticalStore((s) => s.status);
  const selectedUnitIds = useTacticalStore((s) => s.selectedUnitIds);
  const units = useTacticalStore((s) => s.units);
  const tick = useTacticalStore((s) => s.tick);

  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Auto-advance tutorial steps based on player actions
  useEffect(() => {
    if (dismissed) return;

    if (step === 0 && status === 'setup') {
      // Step 0: Press Start
    }
    if (step === 0 && status === 'running') {
      setStep(1);
    }
    if (step === 1 && selectedUnitIds.length > 0) {
      setStep(2);
    }
    if (step === 2) {
      const movingUnits = units.filter((u) => u.faction === 'attacker' && u.state === 'moving');
      if (movingUnits.length > 0) setStep(3);
    }
    if (step === 3) {
      const attacking = units.filter((u) => u.faction === 'attacker' && u.state === 'attacking');
      if (attacking.length > 0) setStep(4);
    }
    if (step === 4 && tick > 50) {
      setStep(5); // Final tip
    }
  }, [status, selectedUnitIds, units, tick, step, dismissed]);

  if (dismissed) return null;
  if (status === 'victory' || status === 'defeat') return null;

  const tips = [
    { title: 'Welcome!', text: 'Press Start to begin the tutorial battle. You control the blue (attacker) units.' },
    { title: 'Select a Unit', text: 'Click on one of your blue units to select it. On mobile, just tap it.' },
    { title: 'Move', text: 'With a unit selected, click an empty tile to move there. The unit will pathfind automatically.' },
    { title: 'Attack', text: 'Right-click (or long-press on mobile) on a red enemy to attack. Units also auto-engage enemies in range.' },
    { title: 'Keep Fighting!', text: 'Destroy all enemy units to win. Use the speed controls (1-4 keys) to adjust game speed.' },
    { title: 'You\'re Ready!', text: 'You know the basics! Press ? anytime for keyboard shortcuts. Try other scenarios for more challenge.' },
  ];

  const tip = tips[step];
  if (!tip) return null;

  return (
    <div className="absolute top-12 left-1/2 transform -translate-x-1/2 z-30 max-w-xs w-full px-2">
      <div className="bg-purple-900 bg-opacity-95 rounded-lg px-4 py-3 border border-purple-600 shadow-lg">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-purple-200 font-bold text-sm">{tip.title}</p>
            <p className="text-purple-300 text-xs mt-1">{tip.text}</p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-purple-400 hover:text-purple-200 text-xs ml-2 shrink-0"
          >
            Skip
          </button>
        </div>
        <div className="flex gap-1 mt-2">
          {tips.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded ${i <= step ? 'bg-purple-400' : 'bg-purple-700'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
