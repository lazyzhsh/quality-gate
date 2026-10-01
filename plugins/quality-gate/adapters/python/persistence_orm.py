#!/usr/bin/env python3
"""qgate persistence 参考 runner 的 Entity↔ORM 形态（E5，v1.11.0）。

示范 ORM 层项目如何回报 persistence 观察：before/after 快照与落库记录均取自
ORM 会话（独立新开 session 回读，即 ADR-0013 的"持久化独立回读"），而非裸 SQL。
E3 快照默认强制协议不变（本 runner 恒回报 snapshots）；内核零改动。

用法（persistence 门禁的 argv）:
    ["python", "adapters/python/persistence_orm.py"]

协议（与 persistence-demo 同一观察协议）:
- stdin 收 {"schemaVersion":"0.1","runId":...};
- stdout 回观察 JSON:{schemaVersion, runId, request, persistence:{source, recordCount,
  record}, snapshots:{before, after}}——correlation 字段值=runId（防重放/防预置数据）;
- request 是本参考实现内对 ORM 写操作的一次调用记录（url 用 orm:// 方案如实标注
  非真实 HTTP 服务面;真实项目应回报其真实 API 调用）;
- 依赖:SQLAlchemy 2.x(缺失时退出码 2 并打印安装指引)。
"""
import json
import sys

try:
    from sqlalchemy import Column, Integer, String, create_engine
    from sqlalchemy.orm import DeclarativeBase, Session
except ImportError:
    print("SQLAlchemy is required: python -m pip install sqlalchemy", file=sys.stderr)
    sys.exit(2)


class Base(DeclarativeBase):
    pass


class Payment(Base):
    __tablename__ = "payments"
    id = Column(String(64), primary_key=True)
    amount = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False)
    note = Column(String(200))


def record_of(payment):
    return {"id": payment.id, "amount": payment.amount, "currency": payment.currency, "note": payment.note}


def main() -> int:
    request = json.loads(sys.stdin.read())
    run_id = request["runId"]
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        before_record = session.get(Payment, run_id)
        before = {"recordCount": 0 if before_record is None else 1, "record": None if before_record is None else record_of(before_record)}
        session.add(Payment(id=run_id, amount=12500, currency="USD", note="orm reference"))
        session.commit()
    # 独立回读：新会话查询落库结果（不用写侧会话的 identity map）
    with Session(engine) as readback:
        persisted = readback.get(Payment, run_id)
        record = record_of(persisted)
        after = {"recordCount": 1, "record": record}
    print(json.dumps({
        "schemaVersion": "0.1",
        "runId": run_id,
        "request": {"method": "POST", "url": "orm://payments", "status": 201},
        "persistence": {
            "source": "adapters/python/persistence_orm.py (SQLAlchemy 2.x session, in-memory SQLite)",
            "recordCount": 1,
            "record": record,
        },
        "snapshots": {"before": before, "after": after},
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
