"""API tests: public read endpoints and admin auth enforcement."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Figure


# --------------------------------------------------------------------------- public
def test_health(client: TestClient) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["data_is_illustrative"] is True
    assert set(body["counts"]) == {"figures", "relationships", "issues"}


def test_tiers_ladder(client: TestClient) -> None:
    resp = client.get("/api/tiers")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["tiers"]) == 9
    # Ladder must be descending so the UI can render it top to bottom.
    thresholds = [t["threshold"] for t in body["tiers"]]
    assert thresholds == sorted(thresholds, reverse=True)
    assert "coalition" in body["rel_types"]


def test_figures_list_with_derived_scores(client: TestClient, sample_graph: dict) -> None:
    resp = client.get("/api/figures")
    assert resp.status_code == 200
    figures = resp.json()["figures"]
    assert len(figures) == 3

    alpha = next(f for f in figures if f["name"] == "Alpha")
    assert alpha["relationship_count"] == 2
    assert alpha["best_ally"]["name"] == "Beta"
    assert alpha["worst_rival"]["name"] == "Gamma"
    assert alpha["tags"] == []


def test_figure_detail_has_issue_summary(client: TestClient, sample_graph: dict) -> None:
    alpha_id = sample_graph["figures"][0]
    resp = client.get(f"/api/figures/{alpha_id}")
    assert resp.status_code == 200
    body = resp.json()

    assert body["figure"]["name"] == "Alpha"
    assert len(body["relationships"]) == 2
    assert len(body["issue_summary"]) == 2
    assert body["summary"]["relationship_count"] == 2
    # Alpha is allied with Beta and hostile to Gamma, so one of each.
    assert len(body["summary"]["allies"]) == 1
    assert len(body["summary"]["rivals"]) == 1


def test_figure_detail_404(client: TestClient) -> None:
    assert client.get("/api/figures/9999").status_code == 404


def test_relationships_scored_and_sorted(client: TestClient, sample_graph: dict) -> None:
    resp = client.get("/api/relationships")
    assert resp.status_code == 200
    rels = resp.json()["relationships"]
    assert len(rels) == 2

    # Sorted high to low.
    assert rels[0]["score"] > rels[1]["score"]

    allied = rels[0]
    assert allied["source_name"] == "Alpha"
    assert allied["target_name"] == "Beta"
    # base = (80*1.5 + 60*1.0) / 2.5 = 72, which lands in the alliance band.
    assert allied["base_score"] == 72.0
    assert allied["tier"]["key"] == "alliance"
    assert len(allied["issues"]) == 2
    assert allied["issues"][0]["stance"] == "Satu komando"


def test_relationship_filter_by_score(client: TestClient, sample_graph: dict) -> None:
    hostile_only = client.get("/api/relationships?max_score=-50").json()["relationships"]
    assert len(hostile_only) == 1
    assert hostile_only[0]["score"] < 0


def test_issues_include_usage_stats(client: TestClient, sample_graph: dict) -> None:
    issues = client.get("/api/issues").json()["issues"]
    assert len(issues) == 2
    koalisi = next(i for i in issues if i["name"] == "Koalisi")
    assert koalisi["usage_count"] == 2
    assert koalisi["avg_score"] == 5.0  # (80 + -70) / 2


def test_graph_payload_shape(client: TestClient, sample_graph: dict) -> None:
    resp = client.get("/api/graph")
    assert resp.status_code == 200
    body = resp.json()

    assert body["counts"]["nodes"] == 3
    assert body["counts"]["edges"] == 2

    edge = body["edges"][0]
    # The wire format uses from/to for the graph library.
    assert "from" in edge and "to" in edge
    assert "style" in edge
    assert edge["style"]["color"].startswith("#")


def test_graph_threshold_filters_edges(client: TestClient, sample_graph: dict) -> None:
    body = client.get("/api/graph?threshold=90").json()
    assert body["counts"]["edges"] == 0


def test_matrix_is_square_with_diagonal(client: TestClient, sample_graph: dict) -> None:
    body = client.get("/api/matrix").json()
    n = len(body["figures"])
    assert n == 3
    assert len(body["cells"]) == n * n

    diagonal = [c for c in body["cells"] if c["row"] == c["col"]]
    assert len(diagonal) == 3
    assert all(c["self"] for c in diagonal)

    # Symmetric: (a,b) and (b,a) carry the same score.
    lookup = {(c["row"], c["col"]): c for c in body["cells"]}
    for (r, c), cell in lookup.items():
        if r == c:
            continue
        assert cell["score"] == lookup[(c, r)]["score"]


def test_stats_aggregates(client: TestClient, sample_graph: dict) -> None:
    body = client.get("/api/stats").json()
    assert body["totals"]["figures"] == 3
    assert body["totals"]["relationships"] == 2
    assert body["data_is_illustrative"] is True
    assert sum(body["tier_distribution"].values()) == 2
    assert body["most_divisive_issues"]


# --------------------------------------------------------------------------- admin auth
def test_admin_requires_auth(client: TestClient) -> None:
    for method, path in [
        ("get", "/api/admin/audit"),
        ("post", "/api/admin/figures"),
        ("post", "/api/admin/issues"),
        ("post", "/api/admin/relationships"),
    ]:
        resp = getattr(client, method)(path)
        assert resp.status_code == 401, f"{method.upper()} {path} should require auth"


def test_login_rejects_bad_password(client: TestClient, admin_user) -> None:
    resp = client.post(
        "/api/admin/auth/login", json={"username": "admin", "password": "wrong"}
    )
    assert resp.status_code == 401


def test_login_succeeds_and_token_works(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/admin/audit", headers=auth_headers)
    assert resp.status_code == 200
    assert "entries" in resp.json()


def test_invalid_token_rejected(client: TestClient) -> None:
    resp = client.get("/api/admin/audit", headers={"Authorization": "Bearer not-a-token"})
    assert resp.status_code == 401


# --------------------------------------------------------------------------- admin CRUD
def test_create_and_update_figure(client: TestClient, auth_headers: dict) -> None:
    created = client.post(
        "/api/admin/figures",
        headers=auth_headers,
        json={"name": "Delta", "party": "Partai C", "influence": 40, "tags": ["uji"]},
    )
    assert created.status_code == 201
    figure_id = created.json()["id"]

    updated = client.put(
        f"/api/admin/figures/{figure_id}",
        headers=auth_headers,
        json={"name": "Delta", "party": "Partai D", "influence": 55, "tags": ["uji", "ubah"]},
    )
    assert updated.status_code == 200

    fetched = client.get(f"/api/figures/{figure_id}").json()
    assert fetched["figure"]["party"] == "Partai D"
    assert fetched["figure"]["tags"] == ["uji", "ubah"]


def test_duplicate_figure_name_rejected(client: TestClient, auth_headers: dict) -> None:
    payload = {"name": "Duplikat", "influence": 50, "tags": []}
    assert client.post("/api/admin/figures", headers=auth_headers, json=payload).status_code == 201
    resp = client.post("/api/admin/figures", headers=auth_headers, json=payload)
    assert resp.status_code == 400


def test_relationship_rejects_self_link(client: TestClient, auth_headers: dict) -> None:
    figure = client.post(
        "/api/admin/figures", headers=auth_headers, json={"name": "Sendiri", "tags": []}
    ).json()
    resp = client.post(
        "/api/admin/relationships",
        headers=auth_headers,
        json={"source_id": figure["id"], "target_id": figure["id"]},
    )
    assert resp.status_code == 422  # pydantic validator


def test_relationship_rejects_duplicate_pair(client: TestClient, auth_headers: dict) -> None:
    a = client.post(
        "/api/admin/figures", headers=auth_headers, json={"name": "A1", "tags": []}
    ).json()
    b = client.post(
        "/api/admin/figures", headers=auth_headers, json={"name": "B1", "tags": []}
    ).json()
    body = {"source_id": a["id"], "target_id": b["id"]}
    assert client.post("/api/admin/relationships", headers=auth_headers, json=body).status_code == 201
    assert client.post("/api/admin/relationships", headers=auth_headers, json=body).status_code == 400


def test_issue_score_upsert_updates_score(
    client: TestClient, auth_headers: dict, sample_graph: dict
) -> None:
    rel_id = sample_graph["allied"]
    issue_id = sample_graph["issues"][0]

    before = next(
        r for r in client.get("/api/relationships").json()["relationships"] if r["id"] == rel_id
    )

    # Flip the heavy issue to strongly negative and confirm the score moves.
    resp = client.post(
        f"/api/admin/relationships/{rel_id}/issues",
        headers=auth_headers,
        json={"issue_id": issue_id, "score": -100, "weight": 1.5, "stance": "Berubah"},
    )
    assert resp.status_code == 200

    after = next(
        r for r in client.get("/api/relationships").json()["relationships"] if r["id"] == rel_id
    )
    assert after["score"] < before["score"]
    changed = next(i for i in after["issues"] if i["issue_id"] == issue_id)
    assert changed["score"] == -100
    assert changed["stance"] == "Berubah"


def test_modifier_creation_changes_score(
    client: TestClient, auth_headers: dict, sample_graph: dict
) -> None:
    rel_id = sample_graph["allied"]
    before = next(
        r for r in client.get("/api/relationships").json()["relationships"] if r["id"] == rel_id
    )["score"]

    created = client.post(
        f"/api/admin/relationships/{rel_id}/modifiers",
        headers=auth_headers,
        json={"label": "Peristiwa baru", "value": -30, "kind": "scandal"},
    )
    assert created.status_code == 201
    mod_id = created.json()["id"]

    after = next(
        r for r in client.get("/api/relationships").json()["relationships"] if r["id"] == rel_id
    )
    assert after["score"] == before - 30
    assert after["modifier_total"] == -30.0

    client.delete(f"/api/admin/modifiers/{mod_id}", headers=auth_headers)
    restored = next(
        r for r in client.get("/api/relationships").json()["relationships"] if r["id"] == rel_id
    )
    assert restored["score"] == before


def test_delete_figure_cascades_to_relationships(
    client: TestClient, auth_headers: dict, sample_graph: dict
) -> None:
    assert len(client.get("/api/relationships").json()["relationships"]) == 2
    gamma = sample_graph["figures"][2]

    assert client.delete(f"/api/admin/figures/{gamma}", headers=auth_headers).status_code == 200

    remaining = client.get("/api/relationships").json()["relationships"]
    assert len(remaining) == 1
    assert all(gamma not in (r["source_id"], r["target_id"]) for r in remaining)


def test_audit_log_records_mutations(client: TestClient, auth_headers: dict) -> None:
    client.post(
        "/api/admin/figures", headers=auth_headers, json={"name": "Terlacak", "tags": []}
    )
    entries = client.get("/api/admin/audit", headers=auth_headers).json()["entries"]
    assert any(
        e["entity"] == "figure" and e["action"] == "create" and e["detail"] == "Terlacak"
        for e in entries
    )


def test_change_password_requires_correct_old(
    client: TestClient, auth_headers: dict
) -> None:
    bad = client.post(
        "/api/admin/auth/change-password",
        headers=auth_headers,
        json={"old_password": "nope", "new_password": "brand-new-pass"},
    )
    assert bad.status_code == 400


def test_tag_round_trip_through_comma_storage(client: TestClient, auth_headers: dict) -> None:
    """Tags are stored comma-joined, so verify the split/join is lossless."""
    created = client.post(
        "/api/admin/figures",
        headers=auth_headers,
        json={"name": "Tagged", "tags": ["satu", "dua", "tiga"]},
    ).json()
    fetched = client.get(f"/api/figures/{created['id']}").json()
    assert fetched["figure"]["tags"] == ["satu", "dua", "tiga"]


def test_figure_out_includes_derived_fields(client: TestClient, db_session: Session) -> None:
    db_session.add(Figure(name="Solo", tags="x,y", influence=10))
    db_session.commit()
    figures = client.get("/api/figures").json()["figures"]
    solo = next(f for f in figures if f["name"] == "Solo")
    assert solo["relationship_count"] == 0
    assert solo["best_ally"] is None
    assert solo["tags"] == ["x", "y"]


# --------------------------------------------------------------------------- counterpart resolution
def test_figure_detail_names_the_counterpart_not_itself(
    client: TestClient, sample_graph: dict
) -> None:
    """A profile must never list its own name in its relationship rows.

    Relationships are undirected and stored once per pair, so a row's
    target_name is the profile itself whenever the profile is that row's
    target. The API must resolve the counterpart instead.
    """
    for figure_id in sample_graph["figures"]:
        detail = client.get(f"/api/figures/{figure_id}").json()
        profile_name = detail["figure"]["name"]
        for row in detail["relationships"]:
            assert row["counterpart_name"] != profile_name, (
                f"{profile_name} listed itself in its own relationship rows"
            )


def test_counterpart_matches_the_other_side_of_the_pair(
    client: TestClient, sample_graph: dict
) -> None:
    """counterpart_name must be the far end of the edge, on both directions."""
    for figure_id in sample_graph["figures"]:
        detail = client.get(f"/api/figures/{figure_id}").json()
        for row in detail["relationships"]:
            expected_id = row["target_id"] if row["source_id"] == figure_id else row["source_id"]
            expected_name = (
                row["target_name"] if row["source_id"] == figure_id else row["source_name"]
            )
            assert row["counterpart_id"] == expected_id
            assert row["counterpart_name"] == expected_name
            # is_source must agree with the ids, or the client would flip sides.
            assert row["is_source"] == (row["source_id"] == figure_id)


def test_counterpart_is_stable_from_both_ends(client: TestClient, sample_graph: dict) -> None:
    """Both profiles in a pair must see the same score and each other."""
    a_id, b_id = sample_graph["figures"][0], sample_graph["figures"][1]

    from_a = client.get(f"/api/figures/{a_id}").json()
    row_from_a = next(r for r in from_a["relationships"] if r["counterpart_id"] == b_id)

    from_b = client.get(f"/api/figures/{b_id}").json()
    row_from_b = next(r for r in from_b["relationships"] if r["counterpart_id"] == a_id)

    assert row_from_a["id"] == row_from_b["id"]
    assert row_from_a["score"] == row_from_b["score"]
    assert row_from_a["counterpart_name"] != row_from_b["counterpart_name"]
    # Each side names the other.
    assert row_from_a["counterpart_name"] == from_b["figure"]["name"]
    assert row_from_b["counterpart_name"] == from_a["figure"]["name"]


def test_allies_and_rivals_use_counterpart_names(client: TestClient, sample_graph: dict) -> None:
    """The summary lists must agree with the rows they summarise."""
    detail = client.get(f"/api/figures/{sample_graph['figures'][0]}").json()
    by_id = {r["counterpart_id"]: r["counterpart_name"] for r in detail["relationships"]}

    for entry in detail["summary"]["allies"] + detail["summary"]["rivals"]:
        assert by_id.get(entry["id"]) == entry["name"], (
            "summary name disagrees with the relationship row"
        )
        assert entry["name"] != detail["figure"]["name"]
