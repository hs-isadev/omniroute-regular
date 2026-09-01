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
    ('openrouter', 'OpenRouter (free models)', 'OPENROUTER_API_KEY', 'https://openrouter.ai/settings/keys'),
    ('kilo', 'Kilo (free models)', 'KILO_API_KEY', 'https://app.kilo.ai/'),
    ('zai', 'Z.AI (Flash only)', 'ZAI_API_KEY', 'https://z.ai/manage-apikey/apikey-list'),
    ('nvidia', 'NVIDIA (evaluation)', 'NVIDIA_API_KEY', 'https://build.nvidia.com/'),
    ('opencode-zen', 'OpenCode Zen (free models)', 'OPENCODE_ZEN_API_KEY', 'https://opencode.ai/auth'),
]
FIELDS = {row[2] for row in PROVIDERS}

def submit(node, app, runtime, keys, consent):
    if consent is not True or not isinstance(keys, dict) or set(keys) - FIELDS:
        raise ValueError('Confirm free-account settings and use the provided fields.')
    if any(not isinstance(v, str) or len(v) > 4096 or any(c in v for c in '\r\n\0') for v in keys.values()):
        raise ValueError('Keys must be single-line values of at most 4096 characters.')
    if not all(os.path.isabs(p) for p in (node, app, runtime)):
        raise ValueError('Absolute setup paths required.')
    env = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME')}
    env['OMNIROUTE_HOME'] = runtime
    try:
        result = subprocess.run([node, str(pathlib.Path(app) / 'distribution/settings.mjs')], input=json.dumps({'keys': keys, 'freeOnlyConfirmed': True, 'validateCodingCandidates': False}), text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env, timeout=1000, check=False)
        data = json.loads(result.stdout)
        if result.returncode != 0 or data.get('ready') is not True:
            raise ValueError('Validation failed')
        ids = {row[0] for row in PROVIDERS}
        return {'ready': True, 'accepted': [p for p in data.get('accepted', []) if p in ids], 'failed': [p for p in data.get('failed', []) if p in ids]}
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
    window.geometry('740x660')
    outer = ttk.Frame(window, padding=18)
    outer.pack(fill='both', expand=True)
    ttk.Label(outer, text='Connect your free providers', font=('', 16, 'bold')).pack(anchor='w')
    ttk.Label(outer, text='Get a key, paste it beside its provider, then Save and test.\nOne working provider is enough. Blank fields keep previously saved keys.').pack(anchor='w', pady=(8, 14))
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
    for index, (_, label, field, url) in enumerate(PROVIDERS):
        ttk.Label(rows, text=label, width=27).grid(row=index, column=0, sticky='w', pady=6)
        box = ttk.Entry(rows, show='*', width=35)
        box.grid(row=index, column=1, padx=8, pady=6); boxes[field] = box
        def open_link(url=url):
            try: subprocess.Popen(['/usr/bin/xdg-open', url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except OSError: messagebox.showerror('Get key', 'Could not open your browser. Rerun Setup to install xdg-utils.')
        ttk.Button(rows, text='Get key', command=open_link).grid(row=index, column=2, pady=6)
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
        keys = {name: box.get().strip() for name, box in boxes.items()}
        state['busy'] = True; button.configure(state='disabled'); status.set('Testing your keys. This can take a few minutes. Please keep this window open.')
        def work():
            try: inbox.put(submit(args.node, args.app, args.runtime, keys, True))
            except ValueError: inbox.put({'ready': False, 'error': 'Check the key fields: single-line values only.'})
            finally: keys.clear()
        threading.Thread(target=work, daemon=True).start()
    def poll():
        try: result = inbox.get_nowait()
        except queue.Empty: window.after(100, poll); return
        state['busy'] = False; button.configure(state='normal')
        if result['ready']:
            state['ready'] = True
            for box in boxes.values(): box.delete(0, 'end')
            message = 'Working keys saved encrypted. Both host launchers are ready.'
            if result['failed']: message += '\nNot activated: ' + ', '.join(result['failed']) + '. You can retry them later from OmniRoute API Keys.'
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
        assert len(boxes) == 11 and all(box.cget('show') == '*' for box in boxes.values())
        assert 'ZAI_API_KEY' in boxes and 'HF_TOKEN' not in boxes
        window.destroy(); print('PASS: 11 masked Linux fields, free shortlist, responsive form'); return 0
    window.after(100, poll); window.mainloop()
    return 0 if state['ready'] else 2

if __name__ == '__main__':
    try: raise SystemExit(main())
    except Exception:
        print('The key window could not start. Rerun Setup in a Linux desktop session with Python Tk and an unlocked keyring.')
        raise SystemExit(1)
