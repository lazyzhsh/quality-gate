// @ontology AgreementRecord https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Agreements/Agreement
export class AgreementRecord {
 constructor(id){this.id=id;}
 // 运行时绑定（v1.9 W5）：实例在被真实用例执行时自报其本体绑定，
 // semantic runner 据此回报 origin:"runtime" 的观察（与 @ontology 注解的静态读取区分）
 ontologyBinding(){return 'https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Agreements/Agreement';}
}
