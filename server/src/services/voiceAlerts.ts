/**
 * Automatic voice calls for severe escalations.
 *
 * No provider is wired up yet, so every attempt reports NOT_CONFIGURED and the app falls back to the
 * call/SMS buttons. To enable real calls, implement VoiceProvider for your telephony service
 * (Exotel, Twilio, Plivo, ...) and return it from loadProvider() based on VOICE_PROVIDER in .env.
 */

export interface CallTarget {
  name: string;
  phone: string;
}

export interface VoiceProvider {
  name: string;
  call(to: CallTarget, message: string): Promise<void>;
}

export type CallStatus = 'NONE' | 'NOT_CONFIGURED' | 'PLACED' | 'FAILED';

function loadProvider(): VoiceProvider | null {
  switch ((process.env.VOICE_PROVIDER || '').toLowerCase()) {
    // case 'exotel': return new ExotelProvider(process.env.EXOTEL_SID!, process.env.EXOTEL_TOKEN!, ...);
    default:
      return null;
  }
}

const provider = loadProvider();

export const voiceCallsEnabled = () => provider !== null;

export async function placeCalls(targets: CallTarget[], message: string): Promise<CallStatus> {
  const reachable = targets.filter((t) => t.phone);
  if (!reachable.length) return 'NONE';
  if (!provider) return 'NOT_CONFIGURED';
  const results = await Promise.allSettled(reachable.map((t) => provider.call(t, message)));
  results.forEach((r, i) => r.status === 'rejected' && console.error(`Voice call to ${reachable[i].name} failed:`, r.reason));
  return results.some((r) => r.status === 'fulfilled') ? 'PLACED' : 'FAILED';
}
