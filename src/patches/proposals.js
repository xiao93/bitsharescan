var bxPrpSize = 25,
  bxPrpFields = [
    `id`,
    `expiration_time`,
    `review_period_time`,
    `proposer`,
    `required_active_approvals`,
    `available_active_approvals`,
    `required_owner_approvals`,
    `available_owner_approvals`,
    `available_key_approvals`,
    `fail_reason`,
    `block_time`,
    `block_number`,
    `proposed_transaction.operations_object.which`,
  ];
function bxPrpIndex() {
  return Yu(`proposal`);
}
function bxPrpOpen(e) {
  let t = bu(e?.expiration_time);
  return Number.isFinite(t) && t > Date.now();
}
function bxPrpQuery(e) {
  return e === `open`
    ? {
        range: {
          expiration_time: { gte: new Date().toISOString().slice(0, 19) },
        },
      }
    : { match_all: {} };
}
async function bxPrpList(e, t) {
  let n = await bxDeep(
      bxPrpIndex(),
      {
        size: bxPrpSize,
        track_total_hits: !0,
        sort: [{ block_time: `desc` }, { "id.keyword": `desc` }],
        query: bxPrpQuery(e),
        _source: bxPrpFields,
      },
      (t - 1) * bxPrpSize,
    ),
    r = (n.hits?.hits ?? []).map((e) => e._source ?? {}),
    i = await Ku(bxPrpIndex(), {
      size: 0,
      track_total_hits: !0,
      query: bxPrpQuery(`open`),
    }).catch(() => null);
  await zu(
    r.flatMap((e) => [
      e.proposer,
      ...(e.required_active_approvals ?? []),
      ...(e.required_owner_approvals ?? []),
    ]),
  );
  let a = qu(n);
  return {
    rows: r,
    total: a.value,
    relation: a.relation,
    open: i ? qu(i).value : null,
  };
}
function bxPrpOps(e) {
  if (Array.isArray(e)) return e;
  if (typeof e == `string`)
    try {
      let t = qs(e);
      return Array.isArray(t) ? t : [];
    } catch {
      return [];
    }
  return [];
}
function bxPrpStatus({ row: e, live: t }) {
  let { t: n } = B(),
    r = bxPrpOpen(e);
  return e.fail_reason
    ? (0, N.jsx)(`span`, {
        className: `rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800`,
        title: e.fail_reason,
        children: n(`Failed: {reason}`, {
          reason: String(e.fail_reason).slice(0, 60),
        }),
      })
    : r && t !== !1
      ? (0, N.jsx)(`span`, {
          className: `rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800`,
          children: n(`Pending approval`),
        })
      : r
        ? (0, N.jsx)(`span`, {
            className: `text-xs text-muted`,
            children: n(`Executed or removed`),
          })
        : (0, N.jsx)(`span`, {
            className: `text-xs text-muted`,
            children: n(t === !1 ? `Closed (executed or expired)` : `Closed`),
          });
}
function bxPrpTypes({ types: e }) {
  let t = [...new Set(e)],
    n = t.slice(0, 3);
  return (0, N.jsxs)(`div`, {
    className: `flex flex-wrap items-center gap-1`,
    children: [
      n.map((e) => (0, N.jsx)(tp, { type: e }, e)),
      t.length > n.length
        ? (0, N.jsx)(`span`, {
            className: `text-xs text-muted`,
            children: `+${t.length - n.length}`,
          })
        : null,
      e.length > 1
        ? (0, N.jsx)(`span`, {
            className: `text-xs text-muted`,
            children: `×${e.length}`,
          })
        : null,
    ],
  });
}
function bxAccts({ ids: e }) {
  return e?.length
    ? (0, N.jsx)(`div`, {
        className: `flex flex-wrap gap-x-3 gap-y-1`,
        children: e.map((e) => (0, N.jsx)(X, { id: e }, e)),
      })
    : (0, N.jsx)(`span`, { className: `text-muted`, children: `—` });
}
function bxProposals() {
  let { t: e } = B();
  Gp(`Proposals`);
  let [t, n] = Rn(),
    r = t.get(`tab`) === `all` ? `all` : `open`,
    i = Math.max(1, Number(t.get(`page`) || `1`) || 1),
    a = Hs(),
    o = Wp(
      () => (a ? bxPrpList(r, i) : Promise.resolve(null)),
      [r, i, a],
    ),
    s = o.data?.rows ?? [],
    c = o.data ? Math.max(1, Math.ceil(o.data.total / bxPrpSize)) : 1;
  function l(e) {
    let r = new URLSearchParams(t);
    (r.set(`tab`, e), r.delete(`page`), n(r, { replace: !0 }));
  }
  function u(e) {
    let r = new URLSearchParams(t);
    (r.set(`page`, String(e)), n(r), window.scrollTo(0, 0));
  }
  return (0, N.jsxs)(`div`, {
    children: [
      (0, N.jsx)(rp, {
        items: [{ label: `Home`, to: `/` }, { label: `Proposals` }],
      }),
      (0, N.jsx)(`h1`, {
        className: `text-2xl font-semibold`,
        children: e(`Proposals`),
      }),
      (0, N.jsx)(`p`, {
        className: `mb-4 mt-1 max-w-3xl text-sm text-muted`,
        children: e(
          `Proposed transactions waiting for approvals. Data comes from the Elasticsearch proposal index; a proposal disappears from the chain once it is executed or expires.`,
        ),
      }),
      a
        ? null
        : (0, N.jsx)(Q, {
            message: `This network has no public operation index. Blocks and accounts still load from the node.`,
          }),
      a
        ? (0, N.jsxs)(Z, {
            children: [
              (0, N.jsx)(`div`, {
                className: `flex gap-1 overflow-x-auto border-b border-line px-2`,
                children: [`open`, `all`].map((t) =>
                  (0, N.jsxs)(
                    `button`,
                    {
                      type: `button`,
                      onClick: () => l(t),
                      className: `shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${r === t ? `border-link text-link` : `border-transparent text-muted`}`,
                      children: [
                        e(t === `open` ? `In progress` : `All`),
                        t === `open` && o.data?.open != null
                          ? ` (${H(o.data.open)})`
                          : t === `all` && r === `all` && o.data
                            ? ` (${H(o.data.total)})`
                            : ``,
                      ],
                    },
                    t,
                  ),
                ),
              }),
              o.loading ? (0, N.jsx)($, {}) : null,
              o.error
                ? (0, N.jsx)(`div`, {
                    className: `p-4`,
                    children: (0, N.jsx)(Q, {
                      message: o.error,
                      onRetry: o.reload,
                    }),
                  })
                : null,
              o.data && !s.length && !o.loading
                ? (0, N.jsx)(`p`, {
                    className: `px-4 py-8 text-center text-sm text-muted`,
                    children: e(`No proposals in this tab.`),
                  })
                : null,
              s.length && !o.loading
                ? (0, N.jsx)(`div`, {
                    className: `bx-scroll overflow-x-auto`,
                    children: (0, N.jsxs)(`table`, {
                      className: `w-full min-w-[720px] text-left text-sm`,
                      children: [
                        (0, N.jsx)(`thead`, {
                          className: `bg-canvas text-[11px] uppercase tracking-wide text-muted`,
                          children: (0, N.jsx)(`tr`, {
                            children: [
                              `ID`,
                              `Proposer`,
                              `Operations`,
                              `Required approvals`,
                              `Approved`,
                              `Created`,
                              `Expires`,
                              `Status`,
                            ].map((t) =>
                              (0, N.jsx)(
                                `th`,
                                {
                                  className: `px-4 py-2.5 font-medium`,
                                  children: e(t),
                                },
                                t,
                              ),
                            ),
                          }),
                        }),
                        (0, N.jsx)(`tbody`, {
                          className: `divide-y divide-line`,
                          children: s.map((e) =>
                            (0, N.jsxs)(
                              `tr`,
                              {
                                className: `hover:bg-row`,
                                children: [
                                  (0, N.jsx)(`td`, {
                                    className: `px-4 py-3`,
                                    children: (0, N.jsx)(M, {
                                      to: `/proposal/${e.id}`,
                                      className: `${R} font-mono text-xs`,
                                      children: e.id,
                                    }),
                                  }),
                                  (0, N.jsx)(`td`, {
                                    className: `px-4 py-3`,
                                    children: (0, N.jsx)(X, { id: e.proposer }),
                                  }),
                                  (0, N.jsx)(`td`, {
                                    className: `px-4 py-3`,
                                    children: (0, N.jsx)(bxPrpTypes, {
                                      types: (
                                        e.proposed_transaction
                                          ?.operations_object ?? []
                                      ).map((e) => e.which),
                                    }),
                                  }),
                                  (0, N.jsx)(`td`, {
                                    className: `px-4 py-3`,
                                    children: (0, N.jsx)(bxAccts, {
                                      ids: [
                                        ...(e.required_active_approvals ?? []),
                                        ...(e.required_owner_approvals ?? []),
                                      ],
                                    }),
                                  }),
                                  (0, N.jsx)(`td`, {
                                    className: `px-4 py-3 font-mono tabular-nums`,
                                    children: String(
                                      (e.available_active_approvals?.length ??
                                        0) +
                                        (e.available_owner_approvals?.length ??
                                          0) +
                                        (e.available_key_approvals?.length ?? 0),
                                    ),
                                  }),
                                  (0, N.jsxs)(`td`, {
                                    className: `px-4 py-3 text-xs text-muted`,
                                    children: [
                                      e.block_time
                                        ? (0, N.jsx)(ju, { time: e.block_time })
                                        : `—`,
                                      e.block_number
                                        ? (0, N.jsxs)(`div`, {
                                            children: [
                                              (0, N.jsx)(M, {
                                                to: `/block/${e.block_number}`,
                                                className: R,
                                                children: `#${H(e.block_number)}`,
                                              }),
                                            ],
                                          })
                                        : null,
                                    ],
                                  }),
                                  (0, N.jsx)(`td`, {
                                    className: `px-4 py-3 text-xs text-muted`,
                                    children: xu(e.expiration_time),
                                  }),
                                  (0, N.jsx)(`td`, {
                                    className: `px-4 py-3`,
                                    children: (0, N.jsx)(bxPrpStatus, {
                                      row: e,
                                    }),
                                  }),
                                ],
                              },
                              e.id,
                            ),
                          ),
                        }),
                      ],
                    }),
                  })
                : null,
              o.data && o.data.total > bxPrpSize
                ? (0, N.jsx)(ap, {
                    page: i,
                    hasPrev: i > 1,
                    hasNext: i < c,
                    onPage: u,
                    totalLabel: e(`{n} proposals`, {
                      n: `${o.data.relation === `gte` ? `≥ ` : ``}${H(o.data.total)}`,
                    }),
                  })
                : null,
            ],
          })
        : null,
    ],
  });
}
function bxProposal() {
  let { id: e = `` } = xt(),
    t = decodeURIComponent(e).trim(),
    { t: n } = B();
  Gp(`${n(`Proposal`)} ${t}`);
  let r = Wp(async () => {
      if (!/^1\.10\.\d+$/.test(t))
        throw Error(n(`Proposal {id} was not found.`, { id: t }));
      let [e, r] = await Promise.all([
        z(`get_objects`, [[t]])
          .then((e) => e?.[0] ?? null)
          .catch(() => null),
        Hs()
          ? Ku(bxPrpIndex(), {
              size: 1,
              query: { term: { "id.keyword": t } },
              _source: { excludes: [`proposed_transaction.operations_object`] },
            })
              .then((e) => e.hits?.hits?.[0]?._source ?? null)
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!e && !r) throw Error(n(`Proposal {id} was not found.`, { id: t }));
      let i = { ...(r ?? {}), ...(e ?? {}) },
        a = bxPrpOps(
          e?.proposed_transaction?.operations ??
            r?.proposed_transaction?.operations,
        ).map((e, t) => Cd(0, i.expiration_time ?? ``, ``, 0, t, e));
      return (
        await Promise.all([
          xd(a),
          zu([
            i.proposer,
            ...(i.required_active_approvals ?? []),
            ...(i.available_active_approvals ?? []),
            ...(i.required_owner_approvals ?? []),
            ...(i.available_owner_approvals ?? []),
          ]),
        ]),
        { obj: i, live: !!e, ops: a }
      );
    }, [t]),
    i = r.data?.obj;
  return (0, N.jsxs)(`div`, {
    children: [
      (0, N.jsx)(rp, {
        items: [
          { label: `Home`, to: `/` },
          { label: `Proposals`, to: `/proposals` },
          { label: t },
        ],
      }),
      (0, N.jsxs)(`h1`, {
        className: `mb-4 text-2xl font-semibold`,
        children: [n(`Proposal`), ` `, (0, N.jsx)(`span`, {
          className: `font-mono text-lg text-muted`,
          children: t,
        })],
      }),
      r.loading ? (0, N.jsx)($, { lines: 8 }) : null,
      r.error ? (0, N.jsx)(Q, { message: r.error, onRetry: r.reload }) : null,
      i
        ? (0, N.jsxs)(`div`, {
            className: `space-y-4`,
            children: [
              (0, N.jsx)(Z, {
                title: `Overview`,
                children: (0, N.jsx)(up, {
                  rows: [
                    { label: `ID`, value: i.id ?? t },
                    {
                      label: `Status`,
                      value: (0, N.jsx)(bxPrpStatus, {
                        row: i,
                        live: r.data.live,
                      }),
                    },
                    {
                      label: `On chain now`,
                      value: n(r.data.live ? `Yes` : `No`),
                    },
                    {
                      label: `Proposer`,
                      value: (0, N.jsx)(X, { id: i.proposer }),
                    },
                    {
                      label: `Created in block`,
                      value: i.block_number
                        ? (0, N.jsxs)(`span`, {
                            children: [
                              (0, N.jsx)(M, {
                                to: `/block/${i.block_number}`,
                                className: R,
                                children: `#${H(i.block_number)}`,
                              }),
                              i.block_time ? ` · ${xu(i.block_time)}` : ``,
                            ],
                          })
                        : `—`,
                    },
                    { label: `Expires`, value: xu(i.expiration_time) },
                    {
                      label: `Review period`,
                      value: i.review_period_time
                        ? xu(i.review_period_time)
                        : `—`,
                    },
                    {
                      label: `Required active approvals`,
                      value: (0, N.jsx)(bxAccts, {
                        ids: i.required_active_approvals,
                      }),
                    },
                    {
                      label: `Approved (active)`,
                      value: (0, N.jsx)(bxAccts, {
                        ids: i.available_active_approvals,
                      }),
                    },
                    {
                      label: `Required owner approvals`,
                      value: (0, N.jsx)(bxAccts, {
                        ids: i.required_owner_approvals,
                      }),
                    },
                    {
                      label: `Approved (owner)`,
                      value: (0, N.jsx)(bxAccts, {
                        ids: i.available_owner_approvals,
                      }),
                    },
                    {
                      label: `Key approvals`,
                      value: i.available_key_approvals?.length
                        ? (0, N.jsx)(`div`, {
                            className: `font-mono text-xs`,
                            children: i.available_key_approvals.join(`, `),
                          })
                        : `—`,
                    },
                    ...(i.fail_reason
                      ? [{ label: `Fail reason`, value: i.fail_reason }]
                      : []),
                  ],
                }),
              }),
              (0, N.jsx)(`h2`, {
                className: `text-sm font-semibold text-ink`,
                children: n(`Operations ({n})`, { n: r.data.ops.length }),
              }),
              ...r.data.ops.map((e, t) =>
                (0, N.jsxs)(
                  Z,
                  {
                    title: (0, N.jsxs)(`span`, {
                      className: `inline-flex items-center gap-2`,
                      children: [
                        n(`Operation {n}`, { n: t }),
                        (0, N.jsx)(tp, { type: e.type, virtual: !1 }),
                      ],
                    }),
                    children: [
                      (0, N.jsx)(up, {
                        rows: [
                          {
                            label: `Summary`,
                            value: (0, N.jsx)(op, { op: e }),
                          },
                          {
                            label: `Fee payer`,
                            value: (0, N.jsx)(X, { id: e.feePayer }),
                          },
                          {
                            label: `Fee`,
                            value: (0, N.jsx)(Qf, { value: e.fee }),
                          },
                        ],
                      }),
                      (0, N.jsxs)(`details`, {
                        className: `border-t border-line px-4 py-3 text-sm`,
                        children: [
                          (0, N.jsx)(`summary`, {
                            className: `cursor-pointer font-medium text-link`,
                            children: n(`Decoded operation`),
                          }),
                          (0, N.jsx)(`div`, {
                            className: `mt-3 font-mono text-xs`,
                            children: (0, N.jsx)(dp, { value: e.body }),
                          }),
                        ],
                      }),
                    ],
                  },
                  e.key,
                ),
              ),
            ],
          })
        : null,
    ],
  });
}
