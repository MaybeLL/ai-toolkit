import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('check_dependencies', ROOT / 'plugins/media/skills/video-download/scripts/check_dependencies.py')
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class DependenciesTest(unittest.TestCase):
    def test_empty_path_reports_required_missing_without_running_anything(self):
        with patch.object(CHECK.shutil, 'which', return_value=None), patch.object(CHECK, 'run') as run:
            report = CHECK.check('video', True)
        self.assertFalse(report['ready'])
        self.assertEqual(report['tools']['yt-dlp']['status'], 'missing')
        self.assertIn('ffprobe', report['pending'])
        self.assertEqual(report['tools']['yt-dlp-ejs']['status'], 'unverified')
        run.assert_not_called()

    def test_subtitles_do_not_require_media_tools_or_js_for_other_sites(self):
        with patch.object(CHECK.shutil, 'which', side_effect=lambda name: '/tools/yt-dlp' if name == 'yt-dlp' else None), patch.object(CHECK, 'run', return_value=(0, '2026.10.14\n')):
            report = CHECK.check('subtitles')
        self.assertTrue(report['ready'])
        self.assertEqual(report['required'], ['yt-dlp'])

    def test_node_is_reused_when_deno_missing_and_its_args_are_returned(self):
        def run(argv):
            if '--verbose' in argv:
                self.assertIn('--ignore-config', argv)
                self.assertIn('--no-remote-components', argv)
                self.assertIn('--no-plugin-dirs', argv)
                self.assertFalse(any(arg.startswith('https://') for arg in argv))
                return 2, '[debug] Optional libraries: yt_dlp_ejs-0.3.1\nsecret-cookie-do-not-print'
            return (0, 'v22.20.0\n') if argv[0].endswith('node') else (0, '2026.10.14\n')
        with patch.object(CHECK.shutil, 'which', side_effect=lambda name: None if name == 'deno' else '/tools/' + name), patch.object(CHECK, 'run', side_effect=run):
            report = CHECK.check('subtitles', True)
        self.assertTrue(report['ready'])
        self.assertEqual(report['runtime_args'], ['--js-runtimes', 'node:/tools/node'])
        self.assertNotIn('secret-cookie', json.dumps(report))

    def test_missing_and_unrecognized_ejs_are_distinguished(self):
        self.assertEqual(CHECK.ejs_status('[debug] Optional libraries: sqlite3-3.53.1\n')['status'], 'missing')
        self.assertEqual(CHECK.ejs_status('error: unknown option --no-remote-components')['status'], 'unverified')

    def test_unsupported_node_and_broken_binary_are_not_ready(self):
        with patch.object(CHECK.shutil, 'which', return_value='/tools/node'), patch.object(CHECK, 'run', return_value=(0, 'v20.19.0')):
            self.assertEqual(CHECK.probe('node', ['--version'], r'^v(\d+\.\d+\.\d+)', (22, 0, 0))['status'], 'unusable')
        with patch.object(CHECK.shutil, 'which', return_value='/tools/ffprobe'), patch.object(CHECK, 'run', return_value=(1, 'permission denied')):
            self.assertEqual(CHECK.probe('ffprobe', ['-version'], r'ffprobe version (\S+)')['status'], 'unusable')

    def test_other_runtime_needs_verification_not_an_extra_install(self):
        with patch.object(CHECK.shutil, 'which', side_effect=lambda name: '/tools/qjs' if name == 'qjs' else None):
            report = CHECK.check('subtitles', True)
        self.assertEqual(report['tools']['javascript-runtime']['status'], 'unverified')
        self.assertEqual(report['tools']['javascript-runtime']['alternatives'], ['qjs'])

    def test_version_probe_handles_timeout_without_exposing_output(self):
        with patch.object(CHECK.subprocess, 'run', side_effect=CHECK.subprocess.TimeoutExpired(['node'], 15, output='secret')):
            self.assertEqual(CHECK.run(['node', '--version']), (None, ''))


if __name__ == '__main__':
    unittest.main()
