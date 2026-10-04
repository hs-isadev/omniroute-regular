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

STATUS_VALUES = {'healthy', 'unhealthy', 'expired', 'unknown'}

def safe_statuses(data):
    ids = set(PROVIDER_FIELDS)
    output = []
    for item in data.get('statuses', []):
        if not isinstance(item, dict) or item.get('providerId') not in ids or item.get('slot') not in range(1, 6) or item.get('status') not in STATUS_VALUES:
            continue
        safe = {'providerId': item['providerId'], 'slot': item['slot'], 'status': item['status']}
        for key in ('checkedAt', 'lastAttemptAt'):
            value = item.get(key)
            if isinstance(value, str) and len(value) <= 40: safe[key] = value
        reason = item.get('lastAttemptReasonCode')
        if isinstance(reason, str) and len(reason) <= 64 and reason.replace('_', '').isalnum(): safe['lastAttemptReasonCode'] = reason
        output.append(safe)
    return output

def get_status(node, app, runtime, check=False):
    if not all(os.path.isabs(p) for p in (node, app, runtime)):
        raise ValueError('Absolute setup paths required.')
    env = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME')}
    env['OMNIROUTE_HOME'] = runtime
    try:
        command = [node, str(pathlib.Path(app) / 'distribution/settings.mjs'), '--check-status' if check else '--status']
        result = subprocess.run(command, input='', text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env, timeout=1800, check=False)
        data = json.loads(result.stdout)
        if result.returncode != 0 or data.get('ready') is not True: raise ValueError('Could not read provider statuses')
        return {'ready': True, 'statuses': safe_statuses(data)}
    except (OSError, ValueError, TypeError, AttributeError, subprocess.SubprocessError):
        return {'ready': False, 'error': 'Key status is unavailable. Existing saved keys were not changed.', 'statuses': []}

def submit(node, app, runtime, credentials, consent, existing_setup=False, replace_slots=None):
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
    if replace_slots:
        if not existing_setup or not isinstance(replace_slots, dict) or set(replace_slots) - set(PROVIDER_FIELDS):
            raise ValueError('Replace controls are available only for supported saved slots.')
        for provider, slots in replace_slots.items():
            if not isinstance(slots, list) or len(slots) > 5 or any(slot not in range(1, 6) for slot in slots) or len(set(slots)) != len(slots):
                raise ValueError('Replace controls must use unique slot numbers from 1 to 5.')
        payload['replaceSlots'] = replace_slots
    if any(not isinstance(v, str) or len(v) > 4096 or any(c in v for c in '\r\n\0') for v in values):
        raise ValueError('Keys must be single-line values of at most 4096 characters.')
    if not all(os.path.isabs(p) for p in (node, app, runtime)):
        raise ValueError('Absolute setup paths required.')
    env = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME')}
    env['OMNIROUTE_HOME'] = runtime
    try:
        command = [node, str(pathlib.Path(app) / 'distribution/settings.mjs')]
        if existing_setup:
            command.extend(('--existing', '--restart'))
        result = subprocess.run(command, input=json.dumps(payload), text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env, timeout=1000, check=False)
        data = json.loads(result.stdout)
        if result.returncode != 0 or data.get('ready') is not True:
            raise ValueError('Validation failed')
        ids = {row[0] for row in PROVIDERS}
        slot_results = []
        for item in data.get('slotResults', []):
            if not isinstance(item, dict) or item.get('providerId') not in ids or item.get('slot') not in range(1, 6) or item.get('status') not in ('ACCEPTED', 'FAILED', 'DUPLICATE'):
                continue
            safe_item = {key: item[key] for key in ('providerId', 'slot', 'status')}
            if isinstance(item.get('reasonCode'), str): safe_item['reasonCode'] = item['reasonCode']
            for key in ('requestedSlot', 'matchedSlot'):
                if item.get(key) in range(1, 6): safe_item[key] = item[key]
            if isinstance(item.get('replaced'), bool): safe_item['replaced'] = item['replaced']
            slot_results.append(safe_item)
        stored = [{'providerId': item['providerId'], 'slots': [slot for slot in item.get('slots', []) if slot in range(1, 6)]} for item in data.get('stored', []) if isinstance(item, dict) and item.get('providerId') in ids]
        return {'ready': True, 'accepted': [p for p in data.get('accepted', []) if p in ids], 'failed': [p for p in data.get('failed', []) if p in ids], 'slotResults': slot_results, 'stored': stored, 'statuses': safe_statuses(data)}
    except (OSError, ValueError, TypeError, AttributeError, subprocess.SubprocessError):
        return {'ready': False, 'error': 'No working key could be saved. Check your internet, free quota, and unlocked desktop keyring, then retry. Existing keys were kept.'}

def main():
    import tkinter as tk
    from tkinter import ttk, messagebox
    parser = argparse.ArgumentParser()
    for name in ('node', 'app', 'runtime'): parser.add_argument('--' + name, required=True)
    parser.add_argument('--smoke-test', action='store_true')
    parser.add_argument('--existing', action='store_true')
    args = parser.parse_args()
    window = tk.Tk()
    window.title('OmniRoute - Provider keys (existing setup)' if args.existing else 'OmniRoute - Your API keys')
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
    status_labels = {}
    status_base = {}
    replace_checks = {}
    slot_inputs = {}
    for slot in range(1, 6):
        ttk.Label(rows, text=f'Slot {slot}', width=18).grid(row=0, column=slot, sticky='w', padx=4)
    status_provider_rows = set()
    for index, (_, label, field, url) in enumerate(PROVIDERS):
        provider = PROVIDERS[index][0]
        ttk.Label(rows, text=label, width=25).grid(row=index + 1, column=0, sticky='w', pady=6)
        for slot in range(1, 6):
            cell = ttk.Frame(rows)
            cell.grid(row=index + 1, column=slot, padx=4, pady=3, sticky='w')
            value = tk.StringVar()
            box = ttk.Entry(cell, show='*', width=18, textvariable=value)
            box.pack(anchor='w'); boxes[(provider, slot, field)] = box
            slot_inputs.setdefault((provider, slot), []).append(value)
            if args.existing and provider not in status_provider_rows:
                variable = tk.StringVar(value='Empty')
                label_widget = ttk.Label(cell, textvariable=variable, width=18)
                label_widget.pack(anchor='w')
                status_labels[(provider, slot)] = variable
                status_base[(provider, slot)] = 'Empty'
                selected = tk.BooleanVar(value=False)
                ttk.Checkbutton(cell, text='Replace', variable=selected).pack(anchor='w')
                replace_checks[(provider, slot)] = selected
            if args.existing:
                def mark_unsaved(*_, provider=provider, slot=slot):
                    saved = status_base.get((provider, slot), 'Empty')
                    pending = any(entry.get().strip() for entry in slot_inputs.get((provider, slot), []))
                    if (provider, slot) in status_labels:
                        suffix = 'Replacement not saved' if replace_checks[(provider, slot)].get() else 'New key not saved'
                        status_labels[(provider, slot)].set((saved + ' · ' if saved != 'Empty' else '') + suffix if pending else saved)
                value.trace_add('write', mark_unsaved)
                if (provider, slot) in replace_checks:
                    replace_checks[(provider, slot)].trace_add('write', mark_unsaved)
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
    if args.existing:
        try:
            snapshot = get_status(args.node, args.app, args.runtime)
            if snapshot.get('ready'):
                for item in snapshot['statuses']:
                    key = (item['providerId'], item['slot'])
                    text = {'healthy': 'Healthy', 'unhealthy': 'Unhealthy', 'expired': 'Expired / rejected', 'unknown': 'Not checked'}.get(item['status'], 'Not checked')
                    if item.get('lastAttemptReasonCode') in ('QUOTA_OR_RATE_LIMIT', 'NETWORK_OR_ENDPOINT_TIMEOUT', 'NETWORK_OR_ENDPOINT_FAILURE'):
                        text += ' · last check blocked'
                    if key in status_labels:
                        status_base[key] = text; status_labels[key].set(text)
        except Exception:
            pass
    def save():
        if state['busy']: return
        if not consent.get(): messagebox.showinfo('Free accounts', 'Please tick the free-account confirmation first.'); return
        slots = {provider: [{} for _ in range(5)] for provider in PROVIDER_FIELDS}
        for (provider, slot, field), box in boxes.items(): slots[provider][slot - 1][field] = box.get().strip()
        replacements = {}
        for (provider, slot), check in replace_checks.items():
            if check.get(): replacements.setdefault(provider, []).append(slot)
        state['busy'] = True; button.configure(state='disabled'); status.set('Testing your keys. This can take a few minutes. Please keep this window open.')
        def work():
            try: inbox.put(submit(args.node, args.app, args.runtime, slots, True, args.existing, replacements))
            except ValueError: inbox.put({'ready': False, 'error': 'Check the key fields: single-line values only.'})
            finally: slots.clear()
        threading.Thread(target=work, daemon=True).start()
    def check_saved_statuses():
        if state['busy']: return
        if not messagebox.askyesno('Check saved keys', 'This sends one small test request for each saved key and may use free-provider quota. Check them now?'): return
        state['busy'] = True; button.configure(state='disabled'); check_button.configure(state='disabled'); status.set('Checking saved keys. This may take a few minutes; no saved keys will be replaced.')
        def work():
            inbox.put({'_operation': 'status-check', **get_status(args.node, args.app, args.runtime, True)})
        threading.Thread(target=work, daemon=True).start()
    def poll():
        try: result = inbox.get_nowait()
        except queue.Empty: window.after(100, poll); return
        state['busy'] = False; button.configure(state='normal')
        if args.existing: check_button.configure(state='normal')
        if result.get('_operation') == 'status-check' or ('statuses' in result and 'slotResults' not in result):
            if result.get('ready'):
                for key, variable in status_labels.items():
                    status_base[key] = 'Empty'; variable.set('Empty')
                for item in result.get('statuses', []):
                    key = (item['providerId'], item['slot'])
                    text = {'healthy': 'Healthy', 'unhealthy': 'Unhealthy', 'expired': 'Expired / rejected', 'unknown': 'Check unavailable'}.get(item['status'], 'Not checked')
                    if item.get('lastAttemptReasonCode') in ('QUOTA_OR_RATE_LIMIT', 'NETWORK_OR_ENDPOINT_TIMEOUT', 'NETWORK_OR_ENDPOINT_FAILURE'):
                        text += ' · last check blocked'
                    if key in status_labels:
                        status_base[key] = text; status_labels[key].set(text)
                for key, variable in status_labels.items():
                    if any(entry.get().strip() for entry in slot_inputs.get(key, [])):
                        suffix = 'Replacement not saved' if replace_checks[key].get() else 'New key not saved'
                        variable.set((status_base[key] + ' · ' if status_base[key] != 'Empty' else '') + suffix)
                status.set('Statuses are updated. “Expired / rejected” means the provider rejected authentication; recheck after replacing.')
            else: status.set(result.get('error', 'Status check unavailable.'))
            window.after(100, poll); return
        if result['ready']:
            state['ready'] = True
            for item in result.get('slotResults', []):
                if item['status'] in ('ACCEPTED', 'DUPLICATE'):
                    for value in slot_inputs.get((item['providerId'], item.get('requestedSlot', item['slot'])), []): value.set('')
                elif item['status'] == 'FAILED':
                    key = (item['providerId'], item.get('requestedSlot', item['slot']))
                    if key in status_labels and status_base.get(key) == 'Empty':
                        status_labels[key].set('Not saved · ' + item.get('reasonCode', 'PROVIDER_ERROR'))
            for item in result.get('statuses', []):
                key = (item['providerId'], item['slot'])
                text = {'healthy': 'Healthy', 'unhealthy': 'Unhealthy', 'expired': 'Expired / rejected', 'unknown': 'Not checked'}.get(item['status'], 'Not checked')
                if key in status_labels: status_base[key] = text
                pending = any(entry.get() for entry in slot_inputs.get(key, []))
                if key in status_labels:
                    suffix = 'Replacement not saved' if replace_checks[key].get() else 'New key not saved'
                    status_labels[key].set((text + ' · ' + suffix) if pending else text)
            message = 'Your existing OmniRoute setup was updated; its routing settings and other saved keys were kept.' if args.existing else 'Validation finished. Both host launchers are ready.'
            accepted = [f"{item['providerId']} slot {item.get('requestedSlot')} was filled; saved to slot {item['slot']}" if item.get('requestedSlot') in range(1, 6) and item.get('requestedSlot') != item['slot'] else f"{item['providerId']} slot {item['slot']}" for item in result['slotResults'] if item['status'] == 'ACCEPTED']
            failed = [f"{item['providerId']} slot {item.get('requestedSlot')} was filled; slot {item['slot']} could not be saved ({item.get('reasonCode', 'PROVIDER_ERROR')})" if item.get('requestedSlot') in range(1, 6) and item.get('requestedSlot') != item['slot'] else f"{item['providerId']} slot {item['slot']} ({item.get('reasonCode', 'PROVIDER_ERROR')})" for item in result['slotResults'] if item['status'] == 'FAILED']
            duplicates = [f"{item['providerId']} slot {item['slot']} duplicates saved slot {item.get('matchedSlot')}" if item.get('matchedSlot') in range(1, 6) else f"{item['providerId']} slot {item['slot']} was already saved" for item in result['slotResults'] if item['status'] == 'DUPLICATE']
            stored = [f"{item['providerId']} ({len(item['slots'])} stored)" for item in result['stored']]
            if accepted: message += '\nAccepted and stored: ' + ', '.join(accepted) + '.'
            if failed: message += '\nNot stored: ' + ', '.join(failed) + '. Existing saved slots were kept.'
            if duplicates: message += '\nSkipped duplicate keys: ' + ', '.join(duplicates) + '.'
            if stored: message += '\nCurrently available: ' + ', '.join(stored) + '.'
            messagebox.showinfo('Saved', message)
            if not args.existing: window.destroy()
            else: status.set('Saved keys stay in their slots. Use “Check saved key statuses” to refresh health or tick Replace before entering a replacement.')
            window.after(100, poll); return
        status.set(result['error']); window.after(100, poll)
    button = ttk.Button(outer, text='Save and test', command=save)
    button.pack(pady=8)
    check_button = ttk.Button(outer, text='Check saved key statuses', command=check_saved_statuses, state='normal' if args.existing else 'disabled')
    if args.existing: check_button.pack(pady=(0, 6))
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
