import importlib.util
import json
import pathlib
import subprocess
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).with_name('settings-gui.py')
spec = importlib.util.spec_from_file_location('keygui', path)
gui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gui)

class KeyFormTests(unittest.TestCase):
    def test_known_fields_only_and_private_stdin(self):
        with patch.object(gui.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '{"ready":true,"accepted":["groq"],"failed":[]}')) as run:
            result = gui.submit('/node', '/app', '/runtime', {'GROQ_API_KEY': 'fixture-key'}, True)
            self.assertTrue(result['ready'])
            args, kwargs = run.call_args
            self.assertNotIn('fixture-key', str(args))
            self.assertIn('fixture-key', kwargs['input'])
            self.assertFalse(kwargs.get('shell', False))
            self.assertEqual(kwargs['env']['OMNIROUTE_HOME'], '/runtime')
        for keys, consent in [({'UNKNOWN': 'fixture-key'}, True), ({'GROQ_API_KEY': 'a\nb'}, True), ({'GROQ_API_KEY': 'x'}, False)]:
            with self.assertRaises(ValueError): gui.submit('/node', '/app', '/runtime', keys, consent)

    def test_errors_do_not_echo_provider_output_or_keys(self):
        with patch.object(gui.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, 'fixture-secret')):
            result = gui.submit('/node', '/app', '/runtime', {'GROQ_API_KEY': 'fixture-secret'}, True)
            self.assertFalse(result['ready'])
            self.assertNotIn('fixture-secret', str(result))

    def test_shortlist_and_partial_success(self):
        self.assertEqual(len(gui.PROVIDERS), 13)
        self.assertTrue(any(row[0] == 'zai' for row in gui.PROVIDERS))
        self.assertTrue(any(row[0] == 'cerebras' for row in gui.PROVIDERS))
        self.assertTrue(any(row[0] == 'sambanova' for row in gui.PROVIDERS))
        self.assertFalse(any(row[0] in ('huggingface', 'vercel', 'longcat') for row in gui.PROVIDERS))
        with patch.object(gui.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '{"ready":true,"accepted":["groq"],"failed":["zai"]}')):
            result = gui.submit('/node', '/app', '/runtime', {'GROQ_API_KEY': 'fixture'}, True)
            self.assertTrue(result['ready'])
            self.assertEqual(result['failed'], ['zai'])

    def test_five_slots_are_sent_and_per_slot_results_are_preserved(self):
        response = '{"ready":true,"accepted":["groq"],"failed":["mistral"],"slotResults":[{"providerId":"groq","slot":3,"requestedSlot":1,"status":"ACCEPTED","reasonCode":"SUCCESS"},{"providerId":"groq","slot":2,"status":"DUPLICATE","reasonCode":"DUPLICATE_CREDENTIAL","matchedSlot":1},{"providerId":"mistral","slot":4,"status":"FAILED","reasonCode":"INVALID_AUTHENTICATION"}],"stored":[{"providerId":"groq","slots":[1,2,3]}]}'
        slots = {'groq': [{}, {'GROQ_API_KEY': 'fixture-slot-two'}, {}, {}, {}]}
        with patch.object(gui.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, response)) as run:
            result = gui.submit('/node', '/app', '/runtime', slots, True)
            payload = run.call_args.kwargs['input']
        self.assertNotIn('fixture-slot-two', str(run.call_args.args))
        self.assertIn('"slots"', payload)
        self.assertEqual(result['slotResults'][0]['slot'], 3)
        self.assertEqual(result['slotResults'][1]['status'], 'DUPLICATE')
        self.assertEqual(result['slotResults'][2]['reasonCode'], 'INVALID_AUTHENTICATION')
        self.assertEqual(result['stored'], [{'providerId': 'groq', 'slots': [1, 2, 3]}])

    def test_saved_statuses_are_filtered_and_explicit_replacements_are_forwarded(self):
        response = '{"ready":true,"accepted":["groq"],"failed":[],"slotResults":[],"stored":[],"statuses":[{"providerId":"groq","slot":2,"status":"healthy","checkedAt":"2026-10-04T00:00:00.000Z"},{"providerId":"bogus","slot":1,"status":"healthy"},{"providerId":"groq","slot":8,"status":"expired"}]}'
        with patch.object(gui.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, response)) as run:
            result = gui.submit('/node', '/app', '/runtime', {'groq': [{}, {'GROQ_API_KEY': 'fixture-new'}]}, True, True, {'groq': [2]})
            payload = json.loads(run.call_args.kwargs['input'])
        self.assertEqual(payload['replaceSlots'], {'groq': [2]})
        self.assertEqual(result['statuses'], [{'providerId': 'groq', 'slot': 2, 'status': 'healthy', 'checkedAt': '2026-10-04T00:00:00.000Z'}])

    def test_status_command_is_local_and_accepts_only_safe_metadata(self):
        response = '{"ready":true,"statuses":[{"providerId":"groq","slot":1,"status":"expired","checkedAt":"2026-10-04T00:00:00.000Z","lastAttemptReasonCode":"INVALID_AUTHENTICATION"},{"providerId":"unknown","slot":2,"status":"healthy"}]}'
        with patch.object(gui.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, response)) as run:
            result = gui.get_status('/node', '/app', '/runtime', True)
        self.assertEqual(result['statuses'], [{'providerId': 'groq', 'slot': 1, 'status': 'expired', 'checkedAt': '2026-10-04T00:00:00.000Z', 'lastAttemptReasonCode': 'INVALID_AUTHENTICATION'}])
        self.assertIn('--check-status', run.call_args.args[0])
        self.assertNotIn('fixture', str(result))

    def test_existing_setup_window_has_per_slot_status_and_explicit_replace_controls(self):
        source = path.read_text(encoding='utf-8')
        self.assertIn('Check saved key statuses', source)
        self.assertIn('replaceSlots', source)
        self.assertIn('status_labels', source)

if __name__ == '__main__': unittest.main()
