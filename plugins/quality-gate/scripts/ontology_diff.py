"""Classify semantic changes between two ontology catalog JSON files.

Manual-upgrade companion (see docs/FIBO-PROVIDER.md): run it between the old
and the regenerated catalog, review the report, then update each project gate's
`acknowledgedOntology` confirmation after re-checking its mappings/terms.

    python ontology_diff.py <old-catalog.json> <new-catalog.json>

Prints a JSON report; every change is classified additive or breaking.
Removed concepts/labels/subclass edges and newly added disjointness are
breaking; added concepts/subclass edges and removed disjointness are additive.
Exit code 1 when breaking changes exist, else 0.
"""
import json
import sys


def load(path):
    with open(path, 'r', encoding='utf-8') as handle:
        data = json.load(handle)
    concepts = {c['iri']: c for c in data['concepts']}
    subclass = {(iri, parent) for iri, c in concepts.items() for parent in c.get('subClassOf', [])}
    disjoint = {(iri, target) for iri, c in concepts.items() for target in c.get('disjointWith', [])}
    return data, concepts, subclass, disjoint


def main():
    if len(sys.argv) != 3:
        print('usage: ontology_diff.py <old-catalog.json> <new-catalog.json>', file=sys.stderr)
        return 2
    old_data, old, old_sub, old_dis = load(sys.argv[1])
    new_data, new, new_sub, new_dis = load(sys.argv[2])
    changes = []
    for iri in sorted(set(old) - set(new)):
        changes.append({'type': 'removedConcept', 'iri': iri, 'impact': 'breaking'})
    for iri in sorted(set(new) - set(old)):
        changes.append({'type': 'addedConcept', 'iri': iri, 'impact': 'additive'})
    for iri in sorted(set(old) & set(new)):
        if old[iri].get('label') != new[iri].get('label'):
            changes.append({'type': 'labelChanged', 'iri': iri, 'from': old[iri].get('label'), 'to': new[iri].get('label'), 'impact': 'breaking'})
    for edge in sorted(old_sub - new_sub):
        changes.append({'type': 'removedSubclassEdge', 'from': edge[0], 'to': edge[1], 'impact': 'breaking'})
    for edge in sorted(new_sub - old_sub):
        changes.append({'type': 'addedSubclassEdge', 'from': edge[0], 'to': edge[1], 'impact': 'additive'})
    for edge in sorted(old_dis - new_dis):
        changes.append({'type': 'removedDisjointEdge', 'from': edge[0], 'to': edge[1], 'impact': 'additive'})
    for edge in sorted(new_dis - old_dis):
        changes.append({'type': 'addedDisjointEdge', 'from': edge[0], 'to': edge[1], 'impact': 'breaking'})
    breaking = [change for change in changes if change['impact'] == 'breaking']
    report = {'schemaVersion': '0.1',
              'old': {'id': old_data.get('id'), 'version': old_data.get('version')},
              'new': {'id': new_data.get('id'), 'version': new_data.get('version')},
              'changeCount': len(changes), 'breakingCount': len(breaking), 'changes': changes}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if breaking else 0


if __name__ == '__main__':
    sys.exit(main())
