"""Aggregate oracle diagnostic; test-first contract awaiting implementation."""


def analyze_rows(rows):
    raise NotImplementedError('Aggregate diagnostic is not implemented')


def load_csv(path, expected_sha256=None):
    raise NotImplementedError('Pinned CSV loading is not implemented')


def main(argv=None):
    raise NotImplementedError('Diagnostic CLI is not implemented')
