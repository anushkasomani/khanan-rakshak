import React from 'react';
import { Heart, Zap, Wind, Thermometer, MapPin } from 'lucide-react';
import { PageHeader, Section } from '../components/ui';

const SIGNALS = [
  { icon: Heart, name: 'Heart rate', detail: 'Wristband sensor for cardiac stress at hot faces', unit: '60–120 bpm' },
  { icon: Zap, name: 'Fatigue', detail: 'Motion sensing for exertion and rest periods', unit: '0–100 index' },
  { icon: Wind, name: 'Gas exposure', detail: 'Cap-lamp cell for local methane build-up', unit: 'CH₄, CO, H₂S' },
  { icon: Thermometer, name: 'Temperature', detail: 'Heat and humidity in deep galleries', unit: 'Wet-bulb °C' },
  { icon: MapPin, name: 'Location', detail: 'Zone beacons, since GPS does not work underground', unit: 'BLE zone' },
];

const PIPELINE = [
  ['Wearable', 'Intrinsically safe BLE device on the worker'],
  ['Gateway', 'Underground node relays to the surface'],
  ['Ingestion', 'Thresholds trigger an automatic SOS'],
  ['Audit log', 'Critical events sealed to the hash chain'],
];

export const FutureHealthMonitoringPage: React.FC = () => (
  <div className="space-y-8">
    <PageHeader
      title="Health monitoring"
      description="Planned. Wearable sensors are not active in this version."
    />

    <Section title="Signals">
      <div className="card divide-y divide-white/[0.05] stagger">
        {SIGNALS.map(({ icon: Icon, name, detail, unit }) => (
          <div key={name} className="flex items-center gap-3 px-4 py-3">
            <Icon className="w-4 h-4 shrink-0 text-zinc-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-200">{name}</p>
              <p className="mt-0.5 text-xs text-zinc-500 truncate">{detail}</p>
            </div>
            <span className="hidden sm:block text-xs text-zinc-500 whitespace-nowrap">{unit}</span>
          </div>
        ))}
      </div>
    </Section>

    <Section title="Data flow">
      <ol className="grid sm:grid-cols-4 gap-3">
        {PIPELINE.map(([name, detail], i) => (
          <li key={name} className="card p-4">
            <p className="text-xs text-zinc-600 tabular-nums">{i + 1}</p>
            <p className="mt-1 text-sm text-zinc-200">{name}</p>
            <p className="mt-1 text-xs text-zinc-500">{detail}</p>
          </li>
        ))}
      </ol>
    </Section>
  </div>
);
