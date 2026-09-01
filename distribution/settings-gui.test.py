import importlib.util
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

if __name__ == '__main__': unittest.main()
