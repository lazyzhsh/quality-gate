"""Deterministically import the pinned FIBO Agreements/Contracts RDF/XML subset.

Manual upgrade workflow: download the raw module files at the pinned revision
from https://github.com/edmcouncil/fibo into assets/fibo/<version>/, update the
SOURCES table (file names + SHA256 + module path/prefix), then run this script.
It regenerates catalog.json from the vendored files only -- no network access.
subClassOf/disjointWith edges whose target lies outside the extracted concept
set are dropped and recorded as manifest counts/lists in the catalog.
"""
from pathlib import Path
import hashlib
import json
import xml.etree.ElementTree as ET

REVISION = '574a83150a34d7188384c2ecbe124843761931d6'
VERSION = 'master_2026Q1'
SOURCES = [
    {'file': 'Agreements.rdf', 'sha256': 'b3303766dbf6ee8ca58fbc4c6a4d970d534d1856730963815feb0674127a03f4',
     'path': 'FND/Agreements/Agreements.rdf', 'prefix': 'https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Agreements/'},
    {'file': 'Contracts.rdf', 'sha256': '653d3ca4f5df6a9732b133f29f276240b9f40e542edeee0fc98f98e778e59c15',
     'path': 'FND/Agreements/Contracts.rdf', 'prefix': 'https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/'},
]
BASE = Path(__file__).resolve().parent.parent / 'assets' / 'fibo' / '2026Q1'
RDF = '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}'
OWL = '{http://www.w3.org/2002/07/owl#}'
RDFS = '{http://www.w3.org/2000/01/rdf-schema#}'

concepts = []
subclass_edges = []
disjoint_edges = []
for source in SOURCES:
    raw = (BASE / source['file']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == source['sha256'], f"FIBO source hash mismatch: {source['file']}"
    root = ET.fromstring(raw)
    for term in root.findall(OWL + 'Class'):
        iri = term.get(RDF + 'about')
        label = term.findtext(RDFS + 'label')
        if not (iri and iri.startswith(source['prefix']) and label and label.strip()):
            continue
        concepts.append({'iri': iri, 'label': label.strip(), 'kind': 'Class', 'source': source['path']})
        for parent in term.findall(RDFS + 'subClassOf'):
            target = parent.get(RDF + 'resource')
            if target:
                subclass_edges.append((iri, target))
        for disj in term.findall(OWL + 'disjointWith'):
            target = disj.get(RDF + 'resource')
            if target:
                disjoint_edges.append((iri, target))

concepts.sort(key=lambda term: term['iri'])
iris = {term['iri'] for term in concepts}
assert len(iris) == len(concepts), 'Duplicate IRI'
by_iri = {term['iri']: term for term in concepts}

kept_subclass, dropped_subclass = [], []
for iri, target in subclass_edges:
    (kept_subclass if target in iris else dropped_subclass).append((iri, target))
kept_disjoint, dropped_disjoint = [], []
for iri, target in disjoint_edges:
    (kept_disjoint if target in iris else dropped_disjoint).append((iri, target))

for iri, target in kept_subclass:
    by_iri[iri]['subClassOf'] = sorted({p for i, p in kept_subclass if i == iri})
for iri, target in kept_disjoint:
    by_iri[iri]['disjointWith'] = sorted({d for i, d in kept_disjoint if i == iri})

# 守护生成物自身的结构约束：subClassOf 无环（provider 侧同样 fail-closed）。
graph = {iri: set(by_iri[iri].get('subClassOf', [])) for iri in iris}
state = {}
def visit(node):
    if state.get(node) == 1:
        return
    if state.get(node) == 0:
        raise AssertionError(f'Cyclic subClassOf produced by generator: {node}')
    state[node] = 0
    for parent in graph[node]:
        visit(parent)
    state[node] = 1
for node in sorted(graph):
    visit(node)

catalog = {'id': 'fibo-fnd-agreements', 'version': VERSION, 'revision': REVISION,
           'sources': [{'file': s['file'], 'sha256': s['sha256'], 'path': s['path']} for s in SOURCES],
           'conceptCount': len(concepts),
           'droppedSubclassEdges': [{'from': i, 'to': t} for i, t in sorted(dropped_subclass)],
           'droppedDisjointEdges': [{'from': i, 'to': t} for i, t in sorted(dropped_disjoint)],
           'concepts': concepts}
catalog_bytes = (json.dumps(catalog, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
(BASE / 'catalog.json').write_bytes(catalog_bytes)
print('catalogSha256=' + hashlib.sha256(catalog_bytes).hexdigest())
print('conceptCount=' + str(len(concepts)))
print('keptSubclassEdges=' + str(len(kept_subclass)) + ' droppedSubclassEdges=' + str(len(dropped_subclass)))
print('keptDisjointEdges=' + str(len(kept_disjoint)) + ' droppedDisjointEdges=' + str(len(dropped_disjoint)))
