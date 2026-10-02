"""Validated phone-menu model; never writes credentials or touches broadcast audio."""
import re

DEFAULT_OPTIONS = [
    {'digit': '1', 'label': 'Games & competitions', 'destination': 'games', 'enabled': True},
    {'digit': '2', 'label': 'Interviews & live show calls', 'destination': 'show', 'enabled': True},
    {'digit': '3', 'label': 'Private station business', 'destination': 'business', 'enabled': True},
]


def validate_options(options):
    if not isinstance(options, list) or not 1 <= len(options) <= 9:
        raise ValueError('Add between one and nine phone options.')
    result, seen = [], set()
    for option in options:
        if not isinstance(option, dict):
            raise ValueError('Invalid phone option.')
        digit = option.get('digit')
        label = option.get('label')
        destination = option.get('destination')
        if not isinstance(digit, str) or not re.fullmatch('[1-9]', digit) or digit in seen:
            raise ValueError('Each option needs a different number from 1 to 9. Zero repeats the greeting.')
        if not isinstance(label, str) or not 1 <= len(label.strip()) <= 80 or any(ord(c) < 32 for c in label):
            raise ValueError('Give each option a short, plain-English name.')
        if destination not in {'games', 'show', 'business'}:
            raise ValueError('Choose games, live show calls, or private station business.')
        if type(option.get('enabled')) is not bool:
            raise ValueError('Choose whether the option is available.')
        seen.add(digit)
        result.append(dict(digit=digit, label=label.strip(), destination=destination,
                           enabled=option['enabled']))
    if not any(option['enabled'] for option in result):
        raise ValueError('Keep at least one phone option available.')
    return sorted(result, key=lambda option: int(option['digit']))


def dialplan_options(options):
    lines = []
    for option in validate_options(options):
        if not option['enabled']:
            continue
        digit, destination = option['digit'], option['destination']
        if destination == 'business':
            lines.append(f'exten => {digit},1,Goto(far-business,s,1)')
        else:
            lines += [f'exten => {digit},1,Playback(far/waiting)',
                      f' same => n,Stasis(far-calls,{destination})',
                      ' same => n,Hangup()']
    return '\n'.join(lines)
