"""Summarize a bounded public snapshot without inferring native viewed state."""
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path


class SearchTitles(HTMLParser):
    def __init__(self):
        super().__init__()
        self.titles = []
        self.cards = 0

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get('data-qa') == 'vacancy-serp__vacancy':
            self.cards += 1
        if tag == 'a' and values.get('data-qa') == 'serp-item__title':
            self.titles.append(values)


root = Path(__file__).resolve().parents[2]
snapshot = root / 'ci-logs/vacancy-viewed-native-search.html'
parser = SearchTitles()
parser.feed(snapshot.read_text())
styled = sum('enable-visited' in row.get('class', '') for row in parser.titles)
assert parser.cards == len(parser.titles) == styled == 20
print(json.dumps(dict(source='https://hh.ru/search/vacancy?text=Python&items_on_page=20',
    snapshot_sha256=hashlib.sha256(snapshot.read_bytes()).hexdigest(),
    anonymous_read_only=True, cards=parser.cards, titles=len(parser.titles),
    visited_capable_titles=styled, native_viewed_state_verified=False,
    exclusion_implemented=False, issue_complete=False), indent=2))
