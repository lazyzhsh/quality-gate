// @ontology-relation urn:demo:Contract hasParty urn:demo:ContractParty
// @ontology-relation urn:demo:Contract creates urn:demo:Obligation
export class ContractRecord {
 constructor(party, obligation){this.party=party;this.obligation=obligation;}
}
