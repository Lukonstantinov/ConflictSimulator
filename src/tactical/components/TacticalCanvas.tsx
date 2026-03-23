import { useEffect, useRef, useCallback } from 'react';
import { TacticalRenderer } from '../map/renderer';
import { useTacticalStore } from '../store/tacticalStore';

interface Props {
  onMoveCommand: (unitIds: string[], target: { x: number; y: number }) => void;
  onAttackCommand: (unitIds: string[], targetUnitId: string) => void;
}

export default function TacticalCanvas({ onMoveCommand, onAttackCommand }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TacticalRenderer | null>(null);
  const map = useTacticalStore((s) => s.map);
  const units = useTacticalStore((s) => s.units);
  const selectedUnitIds = useTacticalStore((s) => s.selectedUnitIds);
  const selectUnits = useTacticalStore((s) => s.selectUnits);
  const addToSelection = useTacticalStore((s) => s.addToSelection);
  const clearSelection = useTacticalStore((s) => s.clearSelection);
  const events = useTacticalStore((s) => s.events);
  const playerFaction = useTacticalStore((s) => s.playerFaction);
  const lastProcessedEvent = useRef(0);

  // Initialize renderer
  useEffect(() => {
    if (!canvasRef.current || !map) return;

    if (rendererRef.current) {
      rendererRef.current.destroy();
    }

    const renderer = new TacticalRenderer(canvasRef.current, map);
    rendererRef.current = renderer;
    lastProcessedEvent.current = 0;

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [map?.id]);

  // Setup click handlers
  const handleUnitClick = useCallback((unitId: string, shift: boolean) => {
    const unit = units.find((u) => u.id === unitId);
    if (!unit) return;

    if (unit.faction === playerFaction) {
      if (shift) {
        addToSelection(unitId);
      } else {
        selectUnits([unitId]);
      }
    } else if (selectedUnitIds.length > 0) {
      // Right-click behavior on enemy: attack
      onAttackCommand(selectedUnitIds, unitId);
    }
  }, [units, playerFaction, selectedUnitIds, selectUnits, addToSelection, onAttackCommand]);

  const handleTileClick = useCallback((x: number, y: number, button: number, _shift: boolean) => {
    if (button === 0 && selectedUnitIds.length > 0) {
      // Check if clicking on an enemy unit
      const enemyUnit = units.find(
        (u) => u.position.x === x && u.position.y === y &&
               u.faction !== playerFaction && u.state !== 'destroyed',
      );
      if (enemyUnit) {
        onAttackCommand(selectedUnitIds, enemyUnit.id);
        return;
      }

      // Move command
      onMoveCommand(selectedUnitIds, { x, y });
    } else if (button === 0 && selectedUnitIds.length === 0) {
      // Check if clicking on own unit
      const ownUnit = units.find(
        (u) => u.position.x === x && u.position.y === y &&
               u.faction === playerFaction && u.state !== 'destroyed',
      );
      if (ownUnit) {
        selectUnits([ownUnit.id]);
      } else {
        clearSelection();
      }
    } else if (button === 2 && selectedUnitIds.length > 0) {
      // Right click: attack if enemy, else move
      const enemyUnit = units.find(
        (u) => u.position.x === x && u.position.y === y &&
               u.faction !== playerFaction && u.state !== 'destroyed',
      );
      if (enemyUnit) {
        onAttackCommand(selectedUnitIds, enemyUnit.id);
      } else {
        onMoveCommand(selectedUnitIds, { x, y });
      }
    }
  }, [selectedUnitIds, units, playerFaction, selectUnits, clearSelection, onMoveCommand, onAttackCommand]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setOnUnitClick(handleUnitClick);
    renderer.setOnTileClick(handleTileClick);
  }, [handleUnitClick, handleTileClick]);

  // Update units, smoke, and redraw map if buildings changed
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !map) return;
    renderer.updateUnits(units, selectedUnitIds);
    renderer.updateSmoke(map);
    renderer.drawMap(map);
  }, [units, selectedUnitIds, map]);

  // Process new events for effects
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const newEvents = events.slice(lastProcessedEvent.current);
    lastProcessedEvent.current = events.length;

    if (newEvents.length > 0) {
      renderer.showShotEffects(newEvents);
    }
  }, [events.length]);

  if (!map) return null;

  return (
    <div className="w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ touchAction: 'none', objectFit: 'contain' }}
      />
    </div>
  );
}
