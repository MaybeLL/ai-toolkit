#!/usr/bin/env python3
"""Read-only PATH/version checks. No URLs, installs, user config or plugin loading."""
import argparse
import json
import platform
import re
import shutil
import subprocess


def run(argv):
    try:
        result = subprocess.run(argv, capture_output=True, text=True, errors='replace', timeout=15)
        return result.returncode, result.stdout + '\n' + result.stderr
    except (OSError, subprocess.TimeoutExpired):
        return None, ''


def probe(name, args, pattern, minimum=None):
    path = shutil.which(name)
    if not path:
        return {'status': 'missing', 'reason': 'not_on_path'}
    code, output = run([path] + args)
    match = re.search(pattern, output, re.MULTILINE)
    if code != 0 or not match:
        return {'status': 'unusable', 'path': path, 'reason': 'version_probe_failed'}
    version = match.group(1)
    status = 'ready'
    if minimum and tuple(map(int, version.split('.'))) < minimum:
        status = 'unusable'
    return {'status': status, 'path': path, 'version': version}


def ejs_status(output):
    # Discard verbose diagnostics: they can contain local paths and proxy settings.
    libraries = re.search(r'^\[debug\] Optional libraries: (.*)$', output, re.MULTILINE)
    if not libraries:
        return {'status': 'unverified', 'reason': 'diagnostic_format_unrecognized'}
    match = re.search(r'\byt_dlp_ejs-([\w.]+)', libraries.group(1))
    if match:
        return {'status': 'ready', 'version': match.group(1), 'reason': 'local_package_detected'}
    return {'status': 'missing', 'reason': 'local_ejs_not_reported'}


def check(mode='video', youtube=False):
    tools = {
        'yt-dlp': probe('yt-dlp', ['--ignore-config', '--no-plugin-dirs', '--version'], r'^(\d{4}\.\d{2}\.\d{2}[\w.\-]*)\s*$'),
    }
    required = ['yt-dlp']
    if mode != 'subtitles':
        for name in ['ffmpeg', 'ffprobe']:
            tools[name] = probe(name, ['-version'], rf'^{name} version ([^\s]+)')
            required.append(name)
    runtime_args = []
    if youtube:
        # Compatibility baseline: yt-dlp EJS documentation, 2026-10-30.
        tools['deno'] = probe('deno', ['--version'], r'^deno (\d+\.\d+\.\d+)', (2, 3, 0))
        tools['node'] = probe('node', ['--version'], r'^v(\d+\.\d+\.\d+)', (22, 0, 0))
        selected = next((name for name in ['deno', 'node'] if tools[name]['status'] == 'ready'), None)
        if selected:
            tools['javascript-runtime'] = {'status': 'ready', 'selected': selected}
            runtime_args = ['--js-runtimes', f"{selected}:{tools[selected]['path']}"]
        else:
            alternatives = [name for name in ['qjs', 'bun'] if shutil.which(name)]
            tools['javascript-runtime'] = {'status': 'unverified' if alternatives else 'missing', 'alternatives': alternatives,
                                           'reason': 'no_verified_deno_or_node'}
        required.extend(['javascript-runtime', 'yt-dlp-ejs'])
        if tools['yt-dlp']['status'] == 'ready':
            _, diagnostic = run([tools['yt-dlp']['path'], '--ignore-config', '--no-plugin-dirs',
                                 '--no-remote-components', '--verbose', '--simulate'] + runtime_args)
            # No URL is deliberate; yt-dlp normally exits 2 after startup diagnostics.
            tools['yt-dlp-ejs'] = ejs_status(diagnostic)
        else:
            tools['yt-dlp-ejs'] = {'status': 'unverified', 'reason': 'yt_dlp_not_ready'}
    pending = [name for name in required if tools[name]['status'] != 'ready']
    return {'system': platform.system(), 'architecture': platform.machine(), 'mode': mode,
            'youtube': youtube, 'tools': tools, 'required': required, 'pending': pending,
            'runtime_args': runtime_args, 'ready': not pending}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['video', 'audio', 'subtitles'], default='video')
    parser.add_argument('--youtube', action='store_true')
    args = parser.parse_args()
    report = check(args.mode, args.youtube)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report['ready'] else 1)
