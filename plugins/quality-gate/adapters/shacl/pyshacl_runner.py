#!/usr/bin/env python3
"""SHACL Core 引擎参考适配器（v1.22，OD-114=B runner 协议外接）。

统一观察协议：stdin 收 {schemaVersion, runId, shapes, records, subClassOf}，
把 JSON 形状声明翻译为 SHACL 形状图、把 JSON 记录翻译为数据图（属性名映射到
urn:qgate:prop:<path> 谓词；{value,lang} 值映射为语言标签字面量），连同子类边
（rdfs:subClassOf 三元组——sh:targetClass 深度匹配由 pyshacl 原生完成）交给
pyshacl 校验，回报结构化 findings。真引擎是 pyshacl；本适配器只做翻译与归一。

依赖：python 3.8+ 与 pyshacl（含 rdflib）。缺失时 stderr 给安装指引并退出码 3
（内核按观察协议视为引擎失败，fail-closed）。
"""
import json
import sys

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")

try:
    from pyshacl import validate as shacl_validate
    import rdflib
except ImportError as exc:  # pragma: no cover - 环境缺依赖的安装指引路径
    sys.stderr.write(
        "pyshacl is required by this SHACL engine adapter.\n"
        "Install guidance: pip install pyshacl\n"
        f"Missing: {exc}\n"
    )
    sys.exit(3)

PROP = "urn:qgate:prop:"
SH = rdflib.SH
RDF = rdflib.RDF
XSD = rdflib.XSD
DATATYPE = {"string": XSD.string, "number": XSD.decimal, "boolean": XSD.boolean}


def literal_for(value):
    """JSON 值 → RDF 字面量（语言标签值映射为 langString；JSON 对象不进数据图——由内核 valueType 判定）。"""
    if isinstance(value, dict) and set(value) == {"value", "lang"}:
        return rdflib.Literal(str(value["value"]), lang=value["lang"])
    if isinstance(value, bool):
        return rdflib.Literal(value, datatype=XSD.boolean)
    if isinstance(value, (int, float)):
        # 经字符串构造：rdflib 对 Python int+显式 decimal 会按值类型规范化改写数据类型
        return rdflib.Literal(str(value), datatype=XSD.decimal)
    return rdflib.Literal(str(value), datatype=XSD.string)


def rdf_list(graph, values):
    """RDF 列表（sh:in / sh:languageIn 的值须为列表形状）。返回表头节点。"""
    head = rdflib.BNode()
    current = head
    for index, builder in enumerate(values):
        graph.add((current, RDF.first, builder()))
        rest = RDF.nil if index == len(values) - 1 else rdflib.BNode()
        graph.add((current, RDF.rest, rest))
        current = rest
    return head


def build_data_graph(request):
    """记录 → 数据图：rdf:type + 子类边 + 属性谓词（urn:qgate:prop:<path>）。"""
    graph = rdflib.Graph()
    node_of = {}
    for record in request["records"]:
        node = rdflib.URIRef(f"{record['typeIri']}#{record['id']}")
        node_of[record["id"]] = node
        graph.add((node, RDF.type, rdflib.URIRef(record["typeIri"])))
        for path, value in record["properties"].items():
            values = value if isinstance(value, list) else [value]
            for item in values:
                if isinstance(item, dict):
                    continue  # {value,lang} 语言值经 literal_for 呈现；其余对象由内核 valueType 判定
                graph.add((node, rdflib.URIRef(PROP + path), literal_for(item)))
        # 语言标签值单独补入（dict 形态在上一循环被跳过）
        for path, value in record["properties"].items():
            values = value if isinstance(value, list) else [value]
            for item in values:
                if isinstance(item, dict) and set(item) == {"value", "lang"}:
                    graph.add((node, rdflib.URIRef(PROP + path), literal_for(item)))
    for edge in request.get("subClassOf", []):
        child = rdflib.URIRef(edge["iri"])
        for parent in edge["parents"]:
            graph.add((child, rdflib.RDFS.subClassOf, rdflib.URIRef(parent)))
    return graph, node_of


def add_property_shape(graph, shape_node, prop):
    p = rdflib.BNode()
    graph.add((shape_node, SH.property, p))
    graph.add((p, SH.path, rdflib.URIRef(PROP + prop["path"])))
    graph.add((p, SH.minCount, rdflib.Literal(prop["minCount"])))
    graph.add((p, SH.maxCount, rdflib.Literal(prop["maxCount"])))
    if prop["valueType"] == "object":
        # JSON 对象无 RDF 对应，按近似 nodeKind 呈现（与内核标注同口径）
        graph.add((p, SH.nodeKind, SH.BlankNodeOrIRI))
    elif "languageIn" not in prop:
        # languageIn 存在时值按设计是语言标签字面量（rdf:langString），再叠加 sh:datatype
        # 会恒假（langString ≠ xsd:string）——语言约束自身承载字符串性
        graph.add((p, SH.datatype, DATATYPE[prop["valueType"]]))
    if "allowedValues" in prop:
        values = prop["allowedValues"]
        graph.add((p, SH["in"], rdf_list(graph, [lambda v=v: literal_for(v) for v in values])))
    if "pattern" in prop:
        graph.add((p, SH.pattern, rdflib.Literal(prop["pattern"])))
    if "minLength" in prop:
        graph.add((p, SH.minLength, rdflib.Literal(prop["minLength"])))
    if "maxLength" in prop:
        graph.add((p, SH.maxLength, rdflib.Literal(prop["maxLength"])))
    if "minInclusive" in prop:
        graph.add((p, SH.minInclusive, rdflib.Literal(prop["minInclusive"], datatype=XSD.decimal)))
    if "maxInclusive" in prop:
        graph.add((p, SH.maxInclusive, rdflib.Literal(prop["maxInclusive"], datatype=XSD.decimal)))
    if "languageIn" in prop:
        langs = prop["languageIn"]
        graph.add((p, SH.languageIn, rdf_list(graph, [lambda v=v: rdflib.Literal(str(v)) for v in langs])))


def build_shapes_graph(request):
    """形状声明 → SHACL 形状图（sh:targetClass 直指；closed 时忽略 rdf:type）。"""
    graph = rdflib.Graph()
    shape_ids = {}
    for shape in request["shapes"]:
        node = rdflib.URIRef("urn:qgate:shape:" + shape["id"])
        shape_ids[str(node)] = shape["id"]
        graph.add((node, RDF.type, SH.NodeShape))
        graph.add((node, SH.targetClass, rdflib.URIRef(shape["targetClass"])))
        for prop in shape["properties"]:
            add_property_shape(graph, node, prop)
        if shape.get("closed") is True:
            graph.add((node, SH.closed, rdflib.Literal(True)))
            graph.add((node, SH.ignoredProperties, rdf_list(graph, [lambda: RDF.type])))
    return graph, shape_ids


def run(request):
    data_graph, node_of = build_data_graph(request)
    shapes_graph, shape_ids = build_shapes_graph(request)
    conforms, results, _ = shacl_validate(
        data_graph=data_graph,
        shacl_graph=shapes_graph,
        inference="none",
        advanced=False,
    )
    node_to_record = {str(node): record_id for record_id, node in node_of.items()}
    findings = []
    for violation in results.subjects(RDF.type, SH.ValidationResult):
        component = str(next(results.objects(violation, SH.sourceConstraintComponent), ""))
        focus = next(results.objects(violation, SH.focusNode), None)
        path_node = next(results.objects(violation, SH.resultPath), None)
        message = next(results.objects(violation, SH.resultMessage), rdflib.Literal(""))
        value = next(results.objects(violation, SH.value), None)
        source_shape = next(results.objects(violation, SH.sourceShape), None)
        path = "(node)"
        if path_node is not None:
            path = str(path_node)[len(PROP):] if str(path_node).startswith(PROP) else str(path_node)
        finding = {
            "recordId": node_to_record.get(str(focus), ""),
            "path": path,
            "component": component,
            "message": str(message),
            **({"value": str(value)} if value is not None else {}),
        }
        shape_id = shape_ids.get(str(source_shape))
        if shape_id:
            finding["shapeId"] = shape_id
        findings.append(finding)
    return {"conformance": bool(conforms), "findings": findings}


def main():
    request = json.loads(sys.stdin.read())
    if request.get("schemaVersion") != "0.1":
        raise SystemExit("unexpected schemaVersion")
    import pyshacl
    result = run(request)
    print(json.dumps({
        "schemaVersion": "0.1",
        "runId": request["runId"],
        "source": f"pyshacl engine adapter ({getattr(pyshacl, '__version__', 'unknown')})",
        "conformance": result["conformance"],
        "findings": result["findings"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
