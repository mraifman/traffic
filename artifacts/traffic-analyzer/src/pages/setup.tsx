import React from 'react';
import { ShieldAlert, Maximize2, Map, Sun, Crosshair, Target, Save } from 'lucide-react';

export function Setup() {
  const steps = [
    {
      icon: Crosshair,
      title: "Camera Position",
      content: "Mount camera perpendicular to traffic flow (not at an angle). Aim for 3–6 meters height. The road/path should fill most of the frame horizontally."
    },
    {
      icon: Maximize2,
      title: "Field of View",
      content: "Use a field of view that shows at least 10–15 meters of the path. Wider means better speed accuracy but smaller objects. 720p or 1080p resolution recommended."
    },
    {
      icon: Target,
      title: "Calibration (Pixels/Meter)",
      content: "Measure a known distance in the frame (e.g., lane width = 3.5m, parking space = 5m). Count how many pixels wide it is in the video. Enter that ratio in the Pixels/Meter slider on the analyze screen. Default is 100 px/m."
    },
    {
      icon: Sun,
      title: "Lighting Conditions",
      content: "Works best in good natural light. Avoid strong backlighting (sun directly in lens). Night operation requires adequate street lighting."
    },
    {
      icon: ShieldAlert,
      title: "Speed Accuracy",
      content: "Speed estimates are most accurate for objects moving roughly perpendicular to the camera. Objects moving toward/away from the camera will show lower apparent speeds."
    },
    {
      icon: Map,
      title: "Detection Classes",
      content: "The model detects: Cars, Pedestrians, Bicycles, Motorcycles, Buses, Trucks. Other objects (animals, skateboards, etc.) are ignored."
    },
    {
      icon: Save,
      title: "Saving Results",
      content: "Stop the session and use the Save button to record counts to the database. View past sessions in the Sessions tab."
    }
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Field Deployment Guide</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Follow these specifications to ensure accurate object detection and speed estimation.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div 
                key={idx} 
                className="p-6 rounded-lg border border-border bg-card flex flex-col"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary font-mono font-bold text-sm shrink-0">
                    {idx + 1}
                  </div>
                  <h3 className="font-semibold text-lg text-card-foreground flex items-center gap-2">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                    {step.title}
                  </h3>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                  {step.content}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
