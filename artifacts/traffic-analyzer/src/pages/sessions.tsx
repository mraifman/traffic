import React, { useState } from 'react';
import { 
  useListSessions, 
  getListSessionsQueryKey, 
  useDeleteSession 
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2, Clock, MapPin, Car, PersonStanding, Bike, Truck, Activity, HardDrive } from 'lucide-react';
import { format } from 'date-fns';

export function Sessions() {
  const { data: sessions, isLoading } = useListSessions();
  const queryClient = useQueryClient();
  const deleteSession = useDeleteSession();

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this session?")) {
      deleteSession.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        }
      });
    }
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-muted-foreground font-mono text-sm animate-pulse">LOADING SESSIONS...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Saved Sessions</h1>
          <div className="text-sm text-muted-foreground font-mono">
            TOTAL RECORDS: {sessions?.length || 0}
          </div>
        </div>

        {!sessions || sessions.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-12 text-center text-muted-foreground">
            <HardDrive className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg">No sessions recorded</p>
            <p className="text-sm mt-1">Run an analysis and save the results to see them here.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {sessions.map(session => (
              <div key={session.id} className="border border-border bg-card rounded-lg p-4 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center group">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{session.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground uppercase font-mono tracking-wider">
                      {session.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground font-mono">
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {format(new Date(session.startedAt), 'yyyy-MM-dd HH:mm')}</span>
                    <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> {formatDuration(session.durationSeconds)}</span>
                    {session.location && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {session.location}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex gap-4 font-mono text-sm">
                    <div className="text-center">
                      <div className="text-muted-foreground flex items-center justify-center gap-1 mb-1"><Car className="w-3 h-3"/> CARS</div>
                      <div className="font-bold text-blue-400">{session.totalCars}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground flex items-center justify-center gap-1 mb-1"><PersonStanding className="w-3 h-3"/> PEDS</div>
                      <div className="font-bold text-green-400">{session.totalPedestrians}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground flex items-center justify-center gap-1 mb-1"><Bike className="w-3 h-3"/> BIKES</div>
                      <div className="font-bold text-amber-400">{session.totalBikes}</div>
                    </div>
                  </div>
                  
                  <div className="h-10 w-px bg-border hidden md:block"></div>
                  
                  <div className="flex gap-4 font-mono text-sm">
                    <div className="text-center">
                      <div className="text-muted-foreground mb-1">AVG SPD</div>
                      <div className="font-bold text-foreground">{session.avgSpeedKph ? `${session.avgSpeedKph} km/h` : '--'}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground mb-1">MAX SPD</div>
                      <div className="font-bold text-foreground">{session.maxSpeedKph ? `${session.maxSpeedKph} km/h` : '--'}</div>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleDelete(session.id)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

