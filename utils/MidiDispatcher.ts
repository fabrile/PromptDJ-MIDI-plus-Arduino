/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import type { ControlChange, NoteMessage } from '../types';

/** Simple class for dispatching MIDI CC messages as events. */
export class MidiDispatcher extends EventTarget {
  private access: MIDIAccess | null = null;
  activeMidiInputId: string | null = null;

  async getMidiAccess(): Promise<string[]> {

    if (this.access) {
      return [...this.access.inputs.keys()];
    }

    if (!navigator.requestMIDIAccess) {
      throw new Error('Your browser does not support the Web MIDI API. For a list of compatible browsers, see https://caniuse.com/midi');
    }

    this.access = await navigator
      .requestMIDIAccess({ sysex: false })
      .catch((error) => error);

    if (this.access === null) {
      throw new Error('Unable to acquire MIDI access.');
    }

    const inputIds = [...this.access.inputs.keys()];

    if (inputIds.length > 0 && this.activeMidiInputId === null) {
      this.activeMidiInputId = inputIds[0];
    }

    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (event: MIDIMessageEvent) => {
        if (input.id !== this.activeMidiInputId) return;

        const { data } = event;
        if (!data) {
          console.error('MIDI message has no data');
          return;
        }

        const statusByte = data[0];
        const channel = statusByte & 0x0f;
        const messageType = statusByte & 0xf0;

        if (messageType === 0xb0) { // Control Change
          const detail: ControlChange = { cc: data[1], value: data[2], channel };
          this.dispatchEvent(
            new CustomEvent<ControlChange>('cc-message', { detail }),
          );
        } else if (messageType === 0x90 || messageType === 0x80) { // Note On/Off
          const note = data[1];
          const velocity = data[2];
          // Note on with velocity 0 is note off
          const type = (messageType === 0x90 && velocity > 0) ? 'on' : 'off';
          const detail: NoteMessage = { note, velocity, channel, type };
          this.dispatchEvent(
              new CustomEvent<NoteMessage>('note-message', { detail })
          );
        }
      };
    }

    return inputIds;
  }

  getDeviceName(id: string): string | null {
    if (!this.access) {
      return null;
    }
    const input = this.access.inputs.get(id);
    return input ? input.name : null;
  }
}