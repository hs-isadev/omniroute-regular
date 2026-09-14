"""Local Linux key form. No web server, plaintext key files, or keys in argv."""
import argparse
import json
import os
import pathlib
import queue
import subprocess
import threading

PROVIDERS = [
    ('groq', 'Groq', 'GROQ_API_KEY', 'https://console.groq.com/keys'),
    ('gemini', 'Gemini', 'GEMINI_API_KEY', 'https://aistudio.google.com/apikey'),
    ('cohere', 'Cohere (evaluation)', 'COHERE_API_KEY', 'https://dashboard.cohere.com/api-keys'),
    ('cloudflare', 'Cloudflare API token', 'CLOUDFLARE_API_TOKEN', 'https://dash.cloudflare.com/'),
    ('cloudflare', 'Cloudflare account ID', 'CLOUDFLARE_ACCOUNT_ID', 'https://dash.cloudflare.com/'),
    ('mistral', 'Mistral (free plan)', 'MISTRAL_API_KEY', 'https://console.mistral.ai/api-keys/'),
    ('cerebras', 'Cerebras (free tier)', 'CEREBRAS_API_KEY', 'https://cloud.cerebras.ai/'),
    ('sambanova', 'SambaNova (free tier)', 'SAMBANOVA_API_KEY', 'https://cloud.sambanova.ai/apis'),
    ('openrouter', 'OpenRouter (free models)', 'OPENROUTER_API_KEY', 'https://openrouter.ai/settings/keys'),
    ('kilo', 'Kilo (free models)', 'KILO_API_KEY', 'https://app.kilo.ai/'),
    ('zai', 'Z.AI (Flash only)', 'ZAI_API_KEY', 'https://z.ai/manage-apikey/apikey-list'),
    ('nvidia', 'NVIDIA (evaluation)', 'NVIDIA_API_KEY', 'https://build.nvidia.com/'),
    ('opencode-zen', 'OpenCode Zen (free models)', 'OPENCODE_ZEN_API_KEY', 'https://opencode.ai/auth'),
]
FIELDS = {row[2] for row in PROVIDERS}
PROVIDER_FIELDS = {}
for provider, _, field, _ in PROVIDERS:
    PROVIDER_FIELDS.setdefault(provider, []).append(field)

def submit(node, app, runtime, credentials, consent):
    if consent is not True or not isinstance(credentials, dict):
        raise ValueError('Confirm free-account settings and use the provided fields.')
    legacy = not (set(credentials) - FIELDS)
    if legacy:
        values = list(credentials.values())
        payload = {'keys': credentials, 'freeOnlyConfirmed': True, 'validateCodingCandidates': False}
    else:
        if set(credentials) - set(PROVIDER_FIELDS):
            raise ValueError('Confirm free-account settings and use the provided fields.')
        values = []
        for provider, slots in credentials.items():
            if not isinstance(slots, list) or len(slots) > 5:
                raise ValueError('Each provider accepts at most five slots.')
            for slot in slots:
                if not isinstance(slot, dict) or set(slot) - set(PROVIDER_FIELDS[provider]):
                    raise ValueError('Confirm free-account settings and use the provided fields.')
                values.extend(slot.values())
        payload = {'slots': credentials, 'freeOnlyConfirmed': True, 'validateCodingCandidates': False}
    if any(not isinstance(v, str) or len(v) > 4096 or any(c in v for c in '\r\n\0') for v in values):
        raise ValueError('Keys must be single-line values of at most 4096 characters.')
    if not all(os.path.isabs(p) for p in (node, app, runtime)):
        raise ValueError('Absolute setup paths required.')
    env = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME')}
    env['OMNIROUTE_HOME'] = runtime
    try:
        result = subprocess.run([node, str(pathlib.Path(app) / 'distribution/settings.mjs')], input=json.dumps(payload), text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env, timeout=1000, check=False)
        data = json.loads(result.stdout)
        if result.returncode != 0 or data.get('ready') is not True:
            raise ValueError('Validation failed')
        ids = {row[0] for row in PROVIDERS}
        slot_results = [item for item in data.get('slotResults', []) if isinstance(item, dict) and item.get('providerId') in ids and item.get('slot') in range(1, 6) and item.get('status') in ('ACCEPTED', 'FAILED')]
        stored = [{'providerId': item['providerId'], 'slots': [slot for slot in item.get('slots', []) if slot in range(1, 6)]} for item in data.get('stored', []) if isinstance(item, dict) and item.get('providerId') in ids]
        return {'ready': True, 'accepted': [p for p in data.get('accepted', []) if p in ids], 'failed': [p for p in data.get('failed', []) if p in ids], 'slotResults': slot_results, 'stored': stored}
    except (OSError, ValueError, TypeError, AttributeError, subprocess.SubprocessError):
        return {'ready': False, 'error': 'No working key could be saved. Check your internet, free quota, and unlocked desktop keyring, then retry. Existing keys were kept.'}

def main():
    import tkinter as tk
    from tkinter import ttk, messagebox
    parser = argparse.ArgumentParser()
    for name in ('node', 'app', 'runtime'): parser.add_argument('--' + name, required=True)
    parser.add_argument('--smoke-test', action='store_true')
    args = parser.parse_args()
    window = tk.Tk()
    window.title('OmniRoute - Your API keys')
    window.geometry('1180x700')
    outer = ttk.Frame(window, padding=18)
    outer.pack(fill='both', expand=True)
    ttk.Label(outer, text='Connect your free providers', font=('', 16, 'bold')).pack(anchor='w')
    ttk.Label(outer, text='Get a key, paste it beside its provider, then Save and test.\nConfigure any supported providers. Blank fields keep previously saved keys.').pack(anchor='w', pady=(8, 14))
    frame = ttk.Frame(outer)
    frame.pack(fill='both', expand=True)
    canvas = tk.Canvas(frame, highlightthickness=0)
    scroll = ttk.Scrollbar(frame, orient='vertical', command=canvas.yview)
    canvas.configure(yscrollcommand=scroll.set)
    scroll.pack(side='right', fill='y'); canvas.pack(side='left', fill='both', expand=True)
    rows = ttk.Frame(canvas)
    canvas.create_window((0, 0), window=rows, anchor='nw')
    rows.bind('<Configure>', lambda _: canvas.configure(scrollregion=canvas.bbox('all')))
    boxes = {}
    for slot in range(1, 6):
        ttk.Label(rows, text=f'Slot {slot}', width=18).grid(row=0, column=slot, sticky='w', padx=4)
    for index, (_, label, field, url) in enumerate(PROVIDERS):
        provider = PROVIDERS[index][0]
        ttk.Label(rows, text=label, width=25).grid(row=index + 1, column=0, sticky='w', pady=6)
        for slot in range(1, 6):
            box = ttk.Entry(rows, show='*', width=18)
            box.grid(row=index + 1, column=slot, padx=4, pady=6); boxes[(provider, slot, field)] = box
        def open_link(url=url):
            try: subprocess.Popen(['/usr/bin/xdg-open', url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except OSError: messagebox.showerror('Get key', 'Could not open your browser. Rerun Setup to install xdg-utils.')
        ttk.Button(rows, text='Get key', command=open_link).grid(row=index + 1, column=6, pady=6)
    consent = tk.BooleanVar()
    ttk.Checkbutton(outer, variable=consent, text='I use free/evaluation accounts. Paid overages and auto top-up are OFF.').pack(anchor='w', pady=(12, 4))
    ttk.Label(outer, text='Cloudflare needs both fields. Keys are saved encrypted on this PC.\nFree quotas and evaluation terms apply. Antigravity login stays in its own app.').pack(anchor='w')
    status = tk.StringVar(value='No keys are included in this download.')
    ttk.Label(outer, textvariable=status, wraplength=670).pack(anchor='w', pady=8)
    state = {'busy': False, 'ready': False}
    inbox = queue.Queue()
    def save():
        if state['busy']: return
        if not consent.get(): messagebox.showinfo('Free accounts', 'Please tick the free-account confirmation first.'); return
        slots = {provider: [{} for _ in range(5)] for provider in PROVIDER_FIELDS}
        for (provider, slot, field), box in boxes.items(): slots[provider][slot - 1][field] = box.get().strip()
        state['busy'] = True; button.configure(state='disabled'); status.set('Testing your keys. This can take a few minutes. Please keep this window open.')
        def work():
            try: inbox.put(submit(args.node, args.app, args.runtime, slots, True))
            except ValueError: inbox.put({'ready': False, 'error': 'Check the key fields: single-line values only.'})
            finally: slots.clear()
        threading.Thread(target=work, daemon=True).start()
    def poll():
        try: result = inbox.get_nowait()
        except queue.Empty: window.after(100, poll); return
        state['busy'] = False; button.configure(state='normal')
        if result['ready']:
            state['ready'] = True
            for box in boxes.values(): box.delete(0, 'end')
            message = 'Validation finished. Both host launchers are ready.'
            accepted = [f"{item['providerId']} slot {item['slot']}" for item in result['slotResults'] if item['status'] == 'ACCEPTED']
            failed = [f"{item['providerId']} slot {item['slot']} ({item.get('reasonCode', 'PROVIDER_ERROR')})" for item in result['slotResults'] if item['status'] == 'FAILED']
            stored = [f"{item['providerId']} ({len(item['slots'])} stored)" for item in result['stored']]
            if accepted: message += '\nAccepted and stored: ' + ', '.join(accepted) + '.'
            if failed: message += '\nNot stored: ' + ', '.join(failed) + '. Existing saved slots were kept.'
            if stored: message += '\nCurrently available: ' + ', '.join(stored) + '.'
            messagebox.showinfo('Saved', message); window.destroy(); return
        status.set(result['error']); window.after(100, poll)
    button = ttk.Button(outer, text='Save and test', command=save)
    button.pack(pady=8)
    def close():
        if state['busy']: messagebox.showinfo('Testing keys', 'Please wait for validation to finish.'); return
        window.destroy()
    window.protocol('WM_DELETE_WINDOW', close)
    if args.smoke_test:
        window.update()
        assert len(boxes) == 65 and all(box.cget('show') == '*' for box in boxes.values())
        assert any(key[2] == 'ZAI_API_KEY' for key in boxes) and not any(key[2] == 'HF_TOKEN' for key in boxes)
        window.destroy(); print('PASS: 65 masked Linux fields, five slots per free provider, responsive form'); return 0
    window.after(100, poll); window.mainloop()
    return 0 if state['ready'] else 2

if __name__ == '__main__':
    try: raise SystemExit(main())
    except Exception:
        print('The key window could not start. Rerun Setup in a Linux desktop session with Python Tk and an unlocked keyring.')
        raise SystemExit(1)
