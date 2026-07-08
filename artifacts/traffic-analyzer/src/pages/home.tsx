import React, { useRef } from 'react';
import { useLocation } from 'wouter';
import { useAnalyzerContext } from '@/context/AnalyzerContext';
import { Camera, FileVideo, Upload, Video, AlertCircle } from 'lucide-react';

export function Home() {
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { startCamera, startVideo, isModelLoading, modelError } = useAnalyzerContext();

  const handleCameraStart = async () => {
    await startCamera();
    setLocation('/analyze');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      startVideo(file);
      setLocation('/analyze');
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-background">
      <div className="max-w-2xl w-full flex flex-col items-center space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Traffic Analysis <span className="text-primary">Workstation</span>
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto text-lg leading-relaxed">
            Real-time object detection and tracking for vehicles, pedestrians, and cyclists. Built for field edge devices.
          </p>
        </div>

        {modelError && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive-foreground px-4 py-3 rounded-md flex items-center gap-3 w-full max-w-md">
            <AlertCircle className="w-5 h-5 shrink-0 text-destructive" />
            <p className="text-sm font-medium">{modelError}</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 w-full max-w-xl">
          <button
            onClick={handleCameraStart}
            disabled={isModelLoading}
            data-testid="button-source-camera"
            className="group flex flex-col items-center justify-center p-8 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-secondary/30 transition-all text-center space-y-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Camera className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Live Camera</h3>
              <p className="text-sm text-muted-foreground mt-1">Connect to webcam or capture card</p>
            </div>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isModelLoading}
            data-testid="button-source-file"
            className="group flex flex-col items-center justify-center p-8 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-secondary/30 transition-all text-center space-y-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Upload Video</h3>
              <p className="text-sm text-muted-foreground mt-1">Analyze a pre-recorded session</p>
            </div>
          </button>
          
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="video/*"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </div>
  );
}
