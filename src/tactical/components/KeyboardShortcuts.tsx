import { useEffect, useState, useCallback } from 'react';
import { useTacticalStore } from '../store/tacticalStore';

interface Props {
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSpeedChange: (speed: number) => void;
}

/**
 * Keyboard shortcuts handler + help modal for tactical mode.
 * Renders the help overlay when ? is pressed.
 */
export default function KeyboardShortcuts({ onStart, onPause, onResume, onSpeedChange }: Props) {
  const [showHelp, setShowHelp] = useState(false);
  const status = useTacticalStore((s) => s.status);
  const selectUnits = useTacticalStore((s) => s.selectUnits);
  const clearSelection = useTacticalStore((s) => s.clearSelection);
  const units = useTacticalStore((s) => s.units);
  const playerFaction = useTacticalStore((s) => s.playerFaction);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if typing in an input
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;

    switch (e.key) {
      case '?':
        setShowHelp((s) => !s);
        break;
      case 'Escape':
        if (showHelp) setShowHelp(false);
        else clearSelection();
        break;
      case ' ':
        e.preventDefault();
        if (status === 'setup') onStart();
        else if (status === 'running') onPause();
        else if (status === 'paused') onResume();
        break;
      case '1':
        onSpeedChange(0.5);
        break;
      case '2':
        onSpeedChange(1);
        break;
      case '3':
        onSpeedChange(2);
        break;
      case '4':
        onSpeedChange(3);
        break;
      case 'a':
        // Select all player units
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const playerUnits = units.filter(
            (u) => u.faction === playerFaction && u.state !== 'destroyed' && u.state !== 'surrendered',
          );
          selectUnits(playerUnits.map((u) => u.id));
        }
        break;
      case 'Tab': {
        // Cycle through player units
        e.preventDefault();
        const playerUnits = units.filter(
          (u) => u.faction === playerFaction && u.state !== 'destroyed' && u.state !== 'surrendered',
        );
        if (playerUnits.length === 0) break;

        const selectedIds = useTacticalStore.getState().selectedUnitIds;
        const currentIdx = playerUnits.findIndex((u) => selectedIds.includes(u.id));
        const nextIdx = (currentIdx + 1) % playerUnits.length;
        selectUnits([playerUnits[nextIdx].id]);
        break;
      }
    }
  }, [status, showHelp, units, playerFaction, onStart, onPause, onResume, onSpeedChange, selectUnits, clearSelection]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowHelp(false)}>
      <div className="bg-gray-800 rounded-lg p-5 max-w-sm w-full mx-4 border border-gray-600" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-bold text-white">Keyboard Shortcuts</h2>
          <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
        <div className="space-y-2 text-sm">
          <ShortcutRow keys="?" desc="Toggle this help" />
          <ShortcutRow keys="Space" desc="Play / Pause" />
          <ShortcutRow keys="Esc" desc="Deselect units" />
          <ShortcutRow keys="Tab" desc="Cycle through units" />
          <ShortcutRow keys="Ctrl+A" desc="Select all units" />
          <ShortcutRow keys="1-4" desc="Set speed (0.5x, 1x, 2x, 3x)" />
          <hr className="border-gray-700 my-2" />
          <p className="text-xs text-gray-400 font-bold">Mouse</p>
          <ShortcutRow keys="Left click" desc="Select unit / Move" />
          <ShortcutRow keys="Right click" desc="Attack target" />
          <ShortcutRow keys="Shift+click" desc="Add to selection" />
          <ShortcutRow keys="Scroll" desc="Zoom" />
          <ShortcutRow keys="Shift+drag" desc="Pan camera" />
          <hr className="border-gray-700 my-2" />
          <p className="text-xs text-gray-400 font-bold">Touch</p>
          <ShortcutRow keys="Tap" desc="Select / Move" />
          <ShortcutRow keys="Long press" desc="Attack command" />
          <ShortcutRow keys="Pinch" desc="Zoom in/out" />
          <ShortcutRow keys="Two-finger drag" desc="Pan camera" />
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="flex justify-between">
      <kbd className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded text-xs font-mono">{keys}</kbd>
      <span className="text-gray-400 text-xs">{desc}</span>
    </div>
  );
}
