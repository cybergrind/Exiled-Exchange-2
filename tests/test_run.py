"""Tests for ./run (guide/poe-source.html, WP-22).

    uv run --with pytest pytest tests/test_run.py

./run has no .py extension, so it is loaded with SourceFileLoader. Its main()
sits behind `if __name__ == '__main__'`, so loading it starts nothing.
Unit tests never touch the network or start the app: subprocess is mocked.
"""

import importlib.machinery
import importlib.util
import subprocess
import sys
from pathlib import Path
from unittest import mock

import pytest


RUN = Path(__file__).resolve().parent.parent / 'run'


def load_run():
    loader = importlib.machinery.SourceFileLoader('run_script', str(RUN))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


run = load_run()


def completed(returncode=0, stdout='', stderr=''):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


@pytest.fixture
def node(monkeypatch):
    monkeypatch.setattr(run.shutil, 'which', lambda tool: f'/usr/bin/{tool}')


# The refresh step


def test_refresh_calls_the_cli_with_if_older_than_60_and_a_20_second_limit(node):
    with mock.patch.object(run.subprocess, 'run', return_value=completed()) as spawn:
        run.refresh_prices()
    spawn.assert_called_once()
    command = spawn.call_args.args[0]
    assert command[0] == '/usr/bin/node'
    assert command[1] == str(run.RENDERER / 'scripts/update-prices.ts')
    assert command[2:] == ['--if-older-than', '60']
    assert spawn.call_args.kwargs['timeout'] == 20


def test_refresh_failure_warns_and_does_not_raise(node, capsys):
    stderr = 'warning: Relay: HTTP 503\nerror: Nothing new for Forbidden Rites\n'
    failed = completed(1, stderr=stderr)
    with mock.patch.object(run.subprocess, 'run', return_value=failed):
        run.refresh_prices()
    err = capsys.readouterr().err
    assert '[run] warning:' in err
    assert 'Nothing new for Forbidden Rites' in err


def test_refresh_timeout_warns_and_does_not_raise(node, capsys):
    timeout = subprocess.TimeoutExpired(cmd=['node'], timeout=20)
    with mock.patch.object(run.subprocess, 'run', side_effect=timeout):
        run.refresh_prices()
    err = capsys.readouterr().err
    assert '[run] warning:' in err
    assert '20' in err


def test_refresh_without_node_warns_and_does_not_raise(monkeypatch, capsys):
    monkeypatch.setattr(run.shutil, 'which', lambda tool: None)
    with mock.patch.object(run.subprocess, 'run') as spawn:
        run.refresh_prices()
    spawn.assert_not_called()
    assert '[run] warning:' in capsys.readouterr().err


def test_refresh_node_vanishing_warns_and_does_not_raise(node, capsys):
    with mock.patch.object(run.subprocess, 'run', side_effect=FileNotFoundError('node')):
        run.refresh_prices()
    assert '[run] warning:' in capsys.readouterr().err


def test_refresh_passes_the_cli_notices_through(node, capsys):
    notice = (
        'notice: Dawn of the Hunt is not the current league; the current one is Forbidden Rites.'
    )
    output = f'{notice}\nDawn of the Hunt: wrote /x/market/dawn-of-the-hunt.json (...).\n'
    with mock.patch.object(run.subprocess, 'run', return_value=completed(0, stdout=output)):
        run.refresh_prices()
    out = capsys.readouterr()
    assert notice in out.out
    assert '[run] warning:' not in out.err


# --no-sync


@pytest.fixture
def main_parts(monkeypatch, tmp_path):
    """main() with every step but argument handling replaced."""
    electron = tmp_path / 'electron'
    electron.touch()
    monkeypatch.setattr(run, 'ELECTRON', electron)
    parts = mock.MagicMock()
    for name in (
        'check_tools', 'check_not_running', 'check_niri', 'install', 'build',
        'prepare_app_config', 'refresh_prices', 'start',
    ):
        monkeypatch.setattr(run, name, getattr(parts, name))
    monkeypatch.setattr(run, 'x_display', lambda: ':0')
    return parts


def test_check_refreshes_prices(main_parts, monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['run', '--check'])
    run.main()
    main_parts.refresh_prices.assert_called_once_with()
    main_parts.start.assert_not_called()


def test_refresh_comes_before_start(main_parts, monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['run'])
    run.main()
    names = [call[0] for call in main_parts.mock_calls]
    assert names.index('refresh_prices') < names.index('start')


def test_no_sync_skips_the_refresh(main_parts, monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['run', '--no-sync'])
    run.main()
    main_parts.refresh_prices.assert_not_called()
    main_parts.start.assert_called_once_with(':0', False, [])  # not passed on to Electron


# MIN_NODE


def test_min_node_is_a_major_minor_tuple():
    assert isinstance(run.MIN_NODE, tuple)
    assert len(run.MIN_NODE) == 2
    assert all(isinstance(part, int) for part in run.MIN_NODE)


@pytest.mark.parametrize(
    ('version', 'ok'),
    [
        ('v22.17.1', False),  # same major, minor too low: an integer major would pass it
        ('v22.18.0', True),
        ('v22.20.0', True),
        ('v24.11.1', True),
        ('v26.11.1', True),
        ('v20.19.5', False),
        ('v18.16.0', False),
    ],
)
def test_check_tools_compares_major_and_minor(node, version, ok):
    assert run.MIN_NODE == (22, 18)
    with mock.patch.object(run.subprocess, 'run', return_value=completed(0, stdout=f'{version}\n')):
        if ok:
            run.check_tools()
        else:
            with pytest.raises(SystemExit, match=r'node 22\.18\+ is required'):
                run.check_tools()
