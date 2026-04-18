// V5 — "Best of" (recommended)
// Base: V1 single-scroll backbone — no tab bar, everything inline, sticky headers.
// Grafted: V2's meal tabs — meals become a first-class, horizontal-tab section
//          instead of a Source filter. Tapping a meal pill filters visible items.
// Removed: Source filter (Meals/Staples) entirely — meal tabs replace it.
// Kept: Type filter (All/Basic/Periodic), compact.
// Bonus: tap a meal pill and the visible item list filters to just that meal's
//        items, without losing your place in the overall scroll.

function V5_BestOf() {
  const [selected, setSelected] = React.useState(() => {
    const s = new Set();
    S_ITEMS.forEach(i => { if (i.DataSource === 'MealIngredients') s.add(i.ItemID); });
    return s;
  });
  const [query, setQuery] = React.useState('');
  const [quickAdd, setQuickAdd] = React.useState('');
  const [oneOffs, setOneOffs] = React.useState([]); // {id, name} added this session
  const [mealFocus, setMealFocus] = React.useState(null); // null | 'all-meals' | mealName
  const [mode, setMode] = React.useState('quickAdd'); // 'quickAdd' | 'search'
  const searchRef = React.useRef(null);
  const quickAddRef = React.useRef(null);

  const toggle = (id) => {
    setSelected(prev => {
      const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const commitQuickAdd = () => {
    const name = quickAdd.trim();
    if (!name) return;
    const newId = `oo-${Date.now()}`;
    setOneOffs(prev => [...prev, { id: newId, name }]);
    setSelected(prev => new Set(prev).add(newId));
    setQuickAdd('');
  };

  // Apply filters
  const filtered = S_ITEMS.filter(i => {
    if (query && !i.ItemName.toLowerCase().includes(query.toLowerCase())) return false;
    if (mealFocus) {
      const m = S_MEALS.find(x => x.name === mealFocus);
      if (!m || !m.itemIds.includes(i.ItemID)) return false;
    }
    return true;
  });

  const mealItems = S_ITEMS.filter(i => i.DataSource === 'MealIngredients');
  const nonMeal = filtered.filter(i => i.DataSource !== 'MealIngredients');
  const groups = byCategory(nonMeal);
  const shownMealItems = filtered.filter(i => i.DataSource === 'MealIngredients');

  const totalSelected = selected.size;
  const totalAvail = S_ITEMS.length;
  const mealsDone = mealItems.filter(i => selected.has(i.ItemID)).length;

  return (
    <div style={{
      width: 390, height: 844, background: ST.bg, color: ST.body,
      fontFamily: ST.font, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>

      {/* ─ Top ─ */}
      <div style={{ padding: '14px 16px 8px', background: ST.bg }}>
        {/* Title + week inline — one row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', border: `2px solid ${ST.primary}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <SIcon name="checkBold" size={12} color={ST.primary}/>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: ST.heading, letterSpacing: -0.3, flexShrink: 0 }}>
            Grocery Staples
          </div>
          <div style={{
            fontSize: 11, color: ST.weekText, fontWeight: 600,
            padding: '3px 8px', borderRadius: 999,
            background: ST.weekHeader,
            border: `1px solid ${ST.primaryDim}44`,
            whiteSpace: 'nowrap', marginLeft: 'auto',
          }}>
            Apr 19 – 25
          </div>
        </div>

        {/* Running count strip — thinner than the old banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: ST.muted,
          paddingBottom: 2,
        }}>
          <span style={{ color: ST.heading, fontWeight: 700 }}>{totalSelected}</span>
          <span>{totalSelected === 1 ? 'item' : 'items'}</span>
          {mealsDone > 0 && (
            <>
              <span style={{ color: ST.mutedDim }}>·</span>
              <span style={{ color: ST.meal, fontWeight: 700 }}>{mealsDone}</span>
              <span style={{ color: ST.meal, opacity: 0.75 }}>from meals</span>
            </>
          )}
        </div>

        {/* Input toolbar — quick-add is primary, search toggles in */}
        <div style={{ marginTop: 10 }}>
          {mode === 'quickAdd' ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', background: ST.surface,
                border: `1px solid ${quickAdd ? ST.accent : ST.border}`, borderRadius: 10,
                transition: 'border 160ms ease',
              }}>
                <SIcon name="zap" size={14} color={quickAdd ? ST.accent : ST.muted}/>
                <input
                  ref={quickAddRef}
                  value={quickAdd}
                  onChange={e => setQuickAdd(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitQuickAdd(); }}
                  placeholder="Quick add one-off item…"
                  style={{
                    flex: 1, border: 'none', background: 'transparent',
                    color: ST.heading, fontSize: 13, outline: 'none',
                    fontFamily: ST.font,
                  }}
                />
              </div>
              <button
                onClick={commitQuickAdd}
                disabled={!quickAdd.trim()}
                style={{
                  padding: '8px 14px', borderRadius: 10,
                  background: quickAdd.trim() ? ST.accent : ST.surface,
                  color: quickAdd.trim() ? '#fff' : ST.mutedDim,
                  border: `1px solid ${quickAdd.trim() ? ST.accent : ST.border}`,
                  fontSize: 12, fontWeight: 700,
                  cursor: quickAdd.trim() ? 'pointer' : 'default',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  transition: 'all 160ms ease',
                }}>
                <SIcon name="plus" size={12} color={quickAdd.trim() ? '#fff' : ST.mutedDim}/>
                Add
              </button>
              <div
                onClick={() => { setMode('search'); setTimeout(() => searchRef.current?.focus(), 40); }}
                style={{
                  padding: '8px 10px', borderRadius: 10,
                  background: ST.surface, border: `1px solid ${ST.border}`,
                  color: ST.muted, cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                }}
                title="Search existing items"
              >
                <SIcon name="search" size={14} color={ST.muted}/>
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px',
              background: ST.surface, border: `1px solid ${ST.primary}`,
              borderRadius: 10,
            }}>
              <SIcon name="search" size={14} color={ST.primary}/>
              <input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search your items…"
                style={{
                  flex: 1, border: 'none', background: 'transparent',
                  color: ST.heading, fontSize: 13, outline: 'none',
                  fontFamily: ST.font,
                }}
              />
              {query && (
                <div style={{
                  padding: '2px 7px', borderRadius: 6,
                  background: ST.bg, color: ST.muted,
                  fontSize: 10, fontWeight: 600,
                }}>{filtered.length + oneOffs.filter(o => o.name.toLowerCase().includes(query.toLowerCase())).length}</div>
              )}
              <div
                onClick={() => { setQuery(''); setMode('quickAdd'); }}
                style={{ cursor: 'pointer', padding: 2 }}
              >
                <SIcon name="x" size={14} color={ST.muted}/>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─ Meal tabs — sticky ─ */}
      <div style={{
        background: ST.bg,
        borderBottom: `1px solid ${ST.borderSoft}`,
        padding: '6px 0 8px',
      }}>
        <div style={{
          display: 'flex', gap: 5, overflowX: 'auto',
          padding: '0 16px', scrollbarWidth: 'none',
        }}>
          <MealTab
            label="All items"
            icon="list"
            active={mealFocus === null}
            onClick={() => setMealFocus(null)}
          />
          <div style={{ width: 1, alignSelf: 'stretch', background: ST.borderSoft, margin: '2px 2px' }}/>
          {S_MEALS.map(m => {
            const count = m.itemIds.filter(id => selected.has(id)).length;
            return (
              <MealTab
                key={m.name}
                label={m.name}
                count={count}
                total={m.itemIds.length}
                tint={ST.meal}
                active={mealFocus === m.name}
                onClick={() => setMealFocus(m.name)}
              />
            );
          })}
        </div>
      </div>

      {/* ─ Scroll region ─ */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '10px 16px 100px',
      }}>
        {/* One-offs you added this session */}
        {!mealFocus && oneOffs.length > 0 && (
          <OneOffCard
            oneOffs={oneOffs}
            selected={selected}
            onToggle={toggle}
            onRemove={(id) => {
              setOneOffs(prev => prev.filter(o => o.id !== id));
              setSelected(prev => {
                const n = new Set(prev); n.delete(id); return n;
              });
            }}
          />
        )}

        {/* Meal items card — only when a meal lens is active OR no filter */}
        {(mealFocus || !query) && shownMealItems.length > 0 && (
          <MealsCard
            activeMeal={mealFocus || null}
            items={shownMealItems}
            selected={selected}
            onToggle={toggle}
            hideHeader={!!mealFocus}
          />
        )}

        {/* Non-meal category groups — hidden when a specific meal is focused */}
        {!mealFocus && groups.map(g => (
          <V5CategorySection
            key={g.name}
            group={g}
            selected={selected}
            onToggle={toggle}
            onToggleAll={() => {
              const ids = g.items.map(i => i.ItemID);
              const all = ids.every(id => selected.has(id));
              setSelected(prev => {
                const n = new Set(prev);
                ids.forEach(id => all ? n.delete(id) : n.add(id));
                return n;
              });
            }}
          />
        ))}

        {/* Empty state for no results */}
        {groups.length === 0 && shownMealItems.length === 0 && (
          <div style={{
            marginTop: 40, textAlign: 'center',
          }}>
            <div style={{ color: ST.muted, fontSize: 13, marginBottom: 14 }}>
              {query ? <>No matches for "{query}"</> : 'Nothing matches these filters'}
            </div>
            {query && (
              <button
                onClick={() => { setQuickAdd(query); setMode('quickAdd'); setTimeout(() => quickAddRef.current?.focus(), 40); }}
                style={{
                  padding: '10px 18px', borderRadius: 10,
                  background: ST.accent, color: '#fff', border: 'none',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                <SIcon name="plus" size={12} color="#fff"/>
                Add "{query}" as one-off
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom commit bar */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '12px 16px',
        background: `linear-gradient(180deg, transparent, ${ST.bg} 40%)`,
        paddingTop: 28,
      }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '10px 10px 10px 16px',
          background: ST.surface, border: `1px solid ${ST.border}`,
          borderRadius: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: ST.muted }}>Ready when you are</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: ST.body, marginTop: 1 }}>
              {totalSelected === 0 ? 'Nothing selected yet' : `${totalSelected} ${totalSelected === 1 ? 'item' : 'items'} in your list`}
            </div>
          </div>
          <button
            disabled={totalSelected === 0}
            style={{
              padding: '11px 18px', borderRadius: 10,
              background: totalSelected === 0 ? ST.borderSoft : ST.primary,
              color: totalSelected === 0 ? ST.mutedDim : '#fff',
              border: 'none',
              fontWeight: 700, fontSize: 14,
              cursor: totalSelected === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 160ms ease',
            }}>
            Review <SIcon name="arrow" size={14} color={totalSelected === 0 ? ST.mutedDim : '#fff'}/>
          </button>
        </div>
      </div>
    </div>
  );
}

function MealTab({ label, icon, count, total, tint, active, onClick }) {
  const tintColor = tint || ST.primary;
  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 11px', borderRadius: 999, flexShrink: 0,
        background: active ? (tint ? tint + '33' : ST.primaryLight) : ST.surface,
        border: `1px solid ${active ? tintColor : ST.border}`,
        color: active ? tintColor : ST.body,
        fontSize: 11, fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 5,
        whiteSpace: 'nowrap',
        transition: 'all 160ms ease',
      }}
    >
      {icon && <SIcon name={icon} size={11} color={active ? tintColor : ST.muted}/>}
      {label}
      {count !== undefined && (
        <span style={{
          fontSize: 10, opacity: 0.75, fontWeight: 500,
        }}>{count}/{total}</span>
      )}
    </div>
  );
}

function MealsCard({ activeMeal, items, selected, onToggle, hideHeader }) {
  const [expanded, setExpanded] = React.useState(true);
  // Group by meal
  const byMeal = {};
  items.forEach(it => {
    if (!byMeal[it.MealName]) byMeal[it.MealName] = [];
    byMeal[it.MealName].push(it);
  });
  const mealNames = activeMeal ? [activeMeal] : Object.keys(byMeal);
  const totalItems = items.length;
  const doneCount = items.filter(i => selected.has(i.ItemID)).length;

  return (
    <div style={{
      marginBottom: 14,
      background: `linear-gradient(180deg, ${ST.mealLight}88, ${ST.surface})`,
      border: `1px solid ${ST.meal}44`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      {!hideHeader && (
        <div
          onClick={() => setExpanded(v => !v)}
          style={{
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: expanded ? `1px solid ${ST.meal}22` : 'none',
            cursor: 'pointer',
          }}
        >
          <SIcon name="chef" size={13} color={ST.meal}/>
          <div style={{
            fontSize: 11, fontWeight: 700, color: ST.meal,
            letterSpacing: 0.3, textTransform: 'uppercase',
            flex: 1,
          }}>
            From your meals
          </div>
          <div style={{
            fontSize: 11, fontWeight: 600, color: ST.meal, opacity: 0.85,
          }}>
            {doneCount}/{totalItems}
          </div>
          <SIcon name={expanded ? 'chevronU' : 'chevronD'} size={14} color={ST.meal}/>
        </div>
      )}
      {expanded && (
        <div style={{ padding: '6px 8px 8px' }}>
          {mealNames.map(meal => (
            <div key={meal} style={{ marginTop: 4 }}>
              <div style={{
                padding: '6px 8px 4px',
                fontSize: 10, fontWeight: 700, color: ST.meal,
                letterSpacing: 0.4, textTransform: 'uppercase',
              }}>
                {meal}
              </div>
              <div style={{
                background: ST.surface + 'cc', borderRadius: 8,
                border: `1px solid ${ST.borderSoft}`,
              }}>
                {(byMeal[meal] || []).map((it, idx, arr) => (
                  <ItemRow
                    key={it.ItemID}
                    item={it}
                    checked={selected.has(it.ItemID)}
                    onToggle={() => onToggle(it.ItemID)}
                    divider={idx < arr.length - 1}
                    hideCategory
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Renamed variant of V1's CategorySection — tuned styling, stores indicator
function V5CategorySection({ group, selected, onToggle, onToggleAll }) {
  const selectedCount = group.items.filter(i => selected.has(i.ItemID)).length;
  const all = selectedCount === group.items.length && group.items.length > 0;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 4px 6px',
        background: ST.bg,
        marginBottom: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: ST.heading,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {group.name}
          </div>
          <div style={{
            fontSize: 11, fontWeight: 600,
            color: selectedCount > 0 ? ST.primary : ST.mutedDim,
            whiteSpace: 'nowrap',
          }}>
            {selectedCount}/{group.items.length}
          </div>
        </div>
        <div
          onClick={onToggleAll}
          style={{
            fontSize: 11, fontWeight: 600, color: ST.muted,
            padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
          }}
        >
          {all ? 'Clear' : 'All'}
        </div>
      </div>

      <div style={{
        background: ST.surface,
        border: `1px solid ${ST.border}`,
        borderRadius: 10, overflow: 'hidden',
      }}>
        {group.items.map((it, idx) => (
          <ItemRow
            key={it.ItemID}
            item={it}
            checked={selected.has(it.ItemID)}
            onToggle={() => onToggle(it.ItemID)}
            divider={idx < group.items.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function OneOffCard({ oneOffs, selected, onToggle, onRemove }) {
  const [expanded, setExpanded] = React.useState(true);
  return (
    <div style={{
      marginBottom: 14,
      background: `linear-gradient(180deg, ${ST.accentLight}88, ${ST.surface})`,
      border: `1px solid ${ST.accent}55`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer',
          borderBottom: expanded ? `1px solid ${ST.accent}22` : 'none',
        }}
      >
        <SIcon name="zap" size={13} color={ST.accent}/>
        <div style={{
          fontSize: 11, fontWeight: 700, color: ST.accent,
          letterSpacing: 0.3, textTransform: 'uppercase', flex: 1,
        }}>
          One-offs this week
        </div>
        <div style={{
          fontSize: 11, fontWeight: 600, color: ST.accent, opacity: 0.85,
        }}>
          {oneOffs.filter(o => selected.has(o.id)).length}/{oneOffs.length}
        </div>
        <SIcon name={expanded ? 'chevronU' : 'chevronD'} size={14} color={ST.accent}/>
      </div>
      {expanded && (
        <div style={{ padding: '6px 8px 8px' }}>
          <div style={{
            background: ST.surface + 'cc', borderRadius: 8,
            border: `1px solid ${ST.borderSoft}`,
          }}>
            {oneOffs.map((o, idx) => (
              <div key={o.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px',
                borderBottom: idx < oneOffs.length - 1 ? `1px solid ${ST.borderSoft}` : 'none',
              }}>
                <div onClick={() => onToggle(o.id)} style={{ cursor: 'pointer' }}>
                  <SCheck checked={selected.has(o.id)} size={20}/>
                </div>
                <div style={{
                  flex: 1, fontSize: 14, fontWeight: 500,
                  color: selected.has(o.id) ? ST.heading : ST.body,
                }}>
                  {o.name}
                </div>
                <div
                  onClick={() => onRemove(o.id)}
                  style={{ cursor: 'pointer', padding: 4, opacity: 0.7 }}
                >
                  <SIcon name="trash" size={14} color={ST.muted}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

window.V5_BestOf = V5_BestOf;
