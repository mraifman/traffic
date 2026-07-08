import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAnalyzerContext } from '@/context/AnalyzerContext';
import { Play, Square, Save, RotateCcw, AlertTriangle, Settings2, Activity, Video } from 'lucide-react';
import { useCreateSession, getListSessionsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export function Analyze() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createSession = useCreateSession();
  
  const {
    videoRef,
    canvasRef,
    isRunning,
    isModelLoading,
    modelLoadProgress,
    modelError,
    counts,
    speedStats,
    fps,
    elapsedSeconds,
    pixelsPerMeter,
    setPixelsPerMeter,
    source,
    stop,
    reset,
  } = useAnalyzerContext();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionLocation, setSessionLocation] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');

  // If no source is selected and we're not running, redirect to home
  useEffect(() => {
    if (!source && !isRunning && !isModelLoading && counts.total === 0) {
      setLocation('/');
    }
  }, [source, isModelLoading, isRunning, counts.total, setLocation]);

  const handleStop = () => {
    stop();
  };

  const handleReset = () => {
    reset();
    setLocation('/');
  };

  const handleSaveClick = () => {
    setSessionName(`Session ${format(new Date(), 'yyyy-MM-dd HH:mm')}`);
    setShowSaveDialog(true);
  };

  const submitSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim()) return;

    createSession.mutate(
      {
        data: {
          name: sessionName,
          source: source || 'camera',
          totalCars: counts.cars,
          totalPedestrians: counts.pedestrians,
          totalBikes: counts.bikes,
          totalMotorcycles: counts.motorcycles,
          totalTrucks: counts.trucks,
          totalBuses: counts.buses,
          durationSeconds: elapsedSeconds,
          avgSpeedKph: speedStats.avg,
          maxSpeedKph: speedStats.max,
          pixelsPerMeter,
          location: sessionLocation || undefined,
          notes: sessionNotes || undefined,
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          setShowSaveDialog(false);
          toast({
            title: "Session saved successfully",
            description: "View it in the Sessions tab.",
          });
          reset();
          setLocation('/sessions');
        },
        onError: (err) => {
          toast({
            title: "Failed to save session",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive",
          });
        }
      }
    );
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-background overflow-hidden">
      {/* Main Video Area */}
      <div className="flex-1 relative bg-black flex flex-col min-h-[50vh]">
        {/* Model Loading State */}
        {isModelLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
            <div className="space-y-4 w-64">
              <div className="flex justify-between font-mono text-sm text-primary">
                <span>LOADING MODEL</span>
                <span>{Math.round(modelLoadProgress)}%</span>
              </div>
              <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${modelLoadProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {modelError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80">
            <div className="bg-destructive/10 text-destructive border border-destructive p-6 rounded-lg max-w-md text-center">
              <AlertTriangle className="w-8 h-8 mx-auto mb-3" />
              <h3 className="font-bold mb-1">Inference Error</h3>
              <p className="text-sm">{modelError}</p>
              <button 
                onClick={handleReset}
                className="mt-4 px-4 py-2 bg-destructive text-destructive-foreground rounded font-medium text-sm"
              >
                Return to Setup
              </button>
            </div>
          </div>
        )}

        {/* Video & Canvas Container */}
        <div className="flex-1 relative w-full h-full flex items-center justify-center">
          <div className="relative w-full h-full max-h-full">
            <video 
              ref={videoRef} 
              className="absolute inset-0 w-full h-full object-contain" 
              muted 
              playsInline 
            />
            <canvas 
              ref={canvasRef} 
              className="absolute inset-0 w-full h-full object-contain pointer-events-none" 
            />
          </div>
        </div>

        {/* Bottom Control Bar */}
        <div className="h-16 bg-card border-t border-border flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded text-xs font-mono">
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              {isRunning ? 'LIVE' : 'STOPPED'}
            </div>
            <div className="font-mono text-sm text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4" /> {fps} FPS
            </div>
            <div className="font-mono text-sm text-muted-foreground border-l border-border pl-4">
              {formatTime(elapsedSeconds)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={handleStop}
                data-testid="button-stop"
                className="flex items-center gap-2 px-4 py-2 bg-destructive/20 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/50 transition-colors rounded font-medium text-sm"
              >
                <Square className="w-4 h-4" /> Stop Analysis
              </button>
            ) : (
              <>
                <button
                  onClick={handleReset}
                  data-testid="button-reset"
                  className="flex items-center gap-2 px-4 py-2 bg-secondary text-foreground hover:bg-secondary/80 border border-border transition-colors rounded font-medium text-sm"
                >
                  <RotateCcw className="w-4 h-4" /> Reset
                </button>
                {counts.total > 0 && (
                  <button
                    onClick={handleSaveClick}
                    data-testid="button-save"
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded font-medium text-sm shadow-lg shadow-primary/20"
                  >
                    <Save className="w-4 h-4" /> Save Session
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar - Data & Settings */}
      <div className="w-full md:w-80 bg-card border-l border-border flex flex-col h-full shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-border">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Telemetry
          </h2>
          
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-secondary/50 p-3 rounded-lg border border-border/50 text-center">
              <div className="text-[10px] text-muted-foreground font-bold mb-1">AVG SPEED</div>
              <div className="font-mono text-2xl text-foreground">
                {speedStats.avg !== null ? speedStats.avg : '--'}
                <span className="text-xs text-muted-foreground ml-1">km/h</span>
              </div>
            </div>
            <div className="bg-secondary/50 p-3 rounded-lg border border-border/50 text-center">
              <div className="text-[10px] text-muted-foreground font-bold mb-1">MAX SPEED</div>
              <div className="font-mono text-2xl text-primary">
                {speedStats.max !== null ? speedStats.max : '--'}
                <span className="text-xs text-primary/70 ml-1">km/h</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 flex-1">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Object Counts</h2>
          <div className="space-y-2">
            <CountRow label="Cars" count={counts.cars} color="bg-blue-500" />
            <CountRow label="Pedestrians" count={counts.pedestrians} color="bg-green-500" />
            <CountRow label="Bicycles" count={counts.bikes} color="bg-amber-500" />
            <CountRow label="Motorcycles" count={counts.motorcycles} color="bg-purple-500" />
            <CountRow label="Trucks" count={counts.trucks} color="bg-orange-500" />
            <CountRow label="Buses" count={counts.buses} color="bg-red-500" />
          </div>
          
          <div className="mt-4 pt-4 border-t border-border flex justify-between items-center font-mono">
            <span className="text-muted-foreground font-bold text-sm">TOTAL</span>
            <span className="text-xl font-bold text-foreground">{counts.total}</span>
          </div>
        </div>

        <div className="p-4 border-t border-border bg-secondary/20">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Calibration
          </h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-foreground">Pixels per Meter</label>
                <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">{pixelsPerMeter}</span>
              </div>
              <input 
                type="range" 
                min="10" 
                max="300" 
                value={pixelsPerMeter} 
                onChange={(e) => setPixelsPerMeter(parseInt(e.target.value))}
                className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                data-testid="slider-calibration"
              />
              <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                Adjust this ratio to improve speed estimation accuracy. Measure a known distance in frame (like a lane width).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save Session Dialog Overlay */}
      {showSaveDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border shadow-2xl rounded-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-border bg-secondary/30">
              <h2 className="text-lg font-bold">Save Analysis Session</h2>
            </div>
            <form onSubmit={submitSave} className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Session Name</label>
                <input 
                  type="text" 
                  required
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-session-name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Location <span className="text-muted-foreground font-normal">(Optional)</span></label>
                <input 
                  type="text" 
                  value={sessionLocation}
                  onChange={(e) => setSessionLocation(e.target.value)}
                  placeholder="e.g. Main St & 4th Ave"
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-session-location"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Notes <span className="text-muted-foreground font-normal">(Optional)</span></label>
                <textarea 
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="Weather conditions, specific observations..."
                  className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-session-notes"
                />
              </div>

              {/* Summary of Data to Save */}
              <div className="bg-secondary p-3 rounded-md border border-border/50 text-xs font-mono grid grid-cols-2 gap-2 text-muted-foreground">
                <div>TOTAL COUNT: <span className="text-foreground">{counts.total}</span></div>
                <div>DURATION: <span className="text-foreground">{formatTime(elapsedSeconds)}</span></div>
                <div>AVG SPD: <span className="text-foreground">{speedStats.avg || '--'} km/h</span></div>
                <div>MAX SPD: <span className="text-foreground">{speedStats.max || '--'} km/h</span></div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowSaveDialog(false)}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={createSession.isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                  data-testid="button-submit-session"
                >
                  {createSession.isPending ? 'Saving...' : <><Save className="w-4 h-4"/> Save Record</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CountRow({ label, count, color }: { label: string, count: number, color: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded hover:bg-secondary/30 transition-colors group">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-sm ${color} shadow-[0_0_8px_rgba(0,0,0,0.3)] shadow-${color.replace('bg-', '')}/50`} />
        <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
      </div>
      <span className="font-mono font-bold text-foreground">{count}</span>
    </div>
  );
}
