import { useEffect, useRef, useCallback } from 'react';
import { TacticalRenderer } from '../map/renderer';
import { useTacticalStore } from '../store/tacticalStore';
import type { TacticalMap } from '../types';

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

  const editorMode    = useTacticalStore((s) => s.editorMode);
  const editorTool    = useTacticalStore((s) => s.editorTool);
  const paintTiles    = useTacticalStore((s) => s.paintTiles);
  const placeEditorUnit = useTacticalStore((s) => s.placeEditorUnit);
  const eraseAt       = useTacticalStore((s) => s.eraseAt);

  // Track if mouse button is held for drag-painting
  const editorPainting = useRef(false);

  // Initialize renderer — use map reference identity (not just id) so switching
  // scenarios with the same preset still re-creates the renderer.
  const mapRef = useRef<TacticalMap | null>(null);
  useEffect(() => {
    if (!canvasRef.current || !map) return;

    // Skip if same map object
    if (mapRef.current === map && rendererRef.current) return;
    mapRef.current = map;

    if (rendererRef.current) {
      rendererRef.current.destroy();
      rendererRef.current = null;
    }

    // Small delay to let the old WebGL context fully release before creating a new one
    const canvas = canvasRef.current;
    const renderer = new TacticalRenderer(canvas, map);
    rendererRef.current = renderer;
    lastProcessedEvent.current = 0;

    return () => {
      renderer.destroy();
      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }
      mapRef.current = null;
    };
  }, [map]);

  // Editor tile interaction (called by renderer tile click + drag)
  const handleEditorTileInteract = useCallback((x: number, y: number) => {
    const state = useTacticalStore.getState();
    if (state.editorTool === 'terrain') {
      state.paintTiles(x, y);
    } else if (state.editorTool === 'unit') {
      state.placeEditorUnit(x, y);
    } else if (state.editorTool === 'erase') {
      state.eraseAt(x, y);
    }
  }, [paintTiles, placeEditorUnit, eraseAt]);

  // Setup click handlers
  const handleUnitClick = useCallback((unitId: string, shift: boolean) => {
    if (editorMode) {
      // In editor mode, clicking a unit with erase tool removes it
      if (editorTool === 'erase') {
        useTacticalStore.setState((s) => ({
          units: s.units.filter((u) => u.id !== unitId),
        }));
      }
      return;
    }

    const unit = units.find((u) => u.id === unitId);
    if (!unit) return;

    if (unit.faction === playerFaction) {
      if (shift) {
        addToSelection(unitId);
      } else {
        selectUnits([unitId]);
      }
    } else if (selectedUnitIds.length > 0) {
      onAttackCommand(selectedUnitIds, unitId);
    }
  }, [editorMode, editorTool, units, playerFaction, selectedUnitIds, selectUnits, addToSelection, onAttackCommand]);

  const handleTileClick = useCallback((x: number, y: number, button: number, _shift: boolean) => {
    if (editorMode) {
      handleEditorTileInteract(x, y);
      return;
    }

    if (button === 0 && selectedUnitIds.length > 0) {
      const enemyUnit = units.find(
        (u) => u.position.x === x && u.position.y === y &&
               u.faction !== playerFaction && u.state !== 'destroyed',
      );
      if (enemyUnit) {
        onAttackCommand(selectedUnitIds, enemyUnit.id);
        return;
      }
      onMoveCommand(selectedUnitIds, { x, y });
    } else if (button === 0 && selectedUnitIds.length === 0) {
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
  }, [editorMode, selectedUnitIds, units, playerFaction, selectUnits, clearSelection, onMoveCommand, onAttackCommand, handleEditorTileInteract]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setOnUnitClick(handleUnitClick);
    renderer.setOnTileClick(handleTileClick);
  }, [handleUnitClick, handleTileClick]);

  // Editor drag painting via canvas pointer events
  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    if (!editorMode) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0 && !e.shiftKey) editorPainting.current = true;
    };
    const onPointerUp = () => { editorPainting.current = false; };
    const onPointerMove = (e: PointerEvent) => {
      if (!editorPainting.current) return;
      // Convert screen coords to tile coords via renderer
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { x: tileX, y: tileY } = renderer.screenToTile(mx, my);
      if (tileX >= 0 && tileY >= 0) {
        handleEditorTileInteract(tileX, tileY);
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
    };
  }, [editorMode, handleEditorTileInteract]);

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
        style={{ touchAction: 'none', objectFit: 'contain', cursor: editorMode ? 'crosshair' : 'default' }}
      />
    </div>
  );
}
