import React from 'react';
import {
  BUILDABLE_STRUCTURES,
  CRAFTING_RECIPES,
  hasResources,
  RESOURCE_LABELS,
  WEAPON_SPECS,
} from '../game/recipes';
import {
  ConsumableId,
  GameSettings,
  GameWorld,
  ResourceKey,
  StructureType,
  WeaponId,
} from '../game/types';

export type DrawerTab =
  | null
  | 'inventory'
  | 'craft'
  | 'build'
  | 'map'
  | 'journal'
  | 'village'
  | 'merchant'
  | 'settings';

interface SurvivalDrawerProps {
  tab: DrawerTab;
  world: GameWorld;
  settings: GameSettings;
  feedback: string | null;
  onChangeTab: (tab: DrawerTab) => void;
  onClose: () => void;
  onEquipWeapon: (id: WeaponId) => void;
  onUseConsumable: (id: ConsumableId) => void;
  onCraft: (recipeId: string) => void;
  onSelectBuild: (type: StructureType) => void;
  onPurchaseOffer: (offerId: string) => void;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
}

const TABS: Array<{ id: Exclude<DrawerTab, null | 'merchant'>; label: string }> = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'craft', label: 'Crafting' },
  { id: 'build', label: 'Build' },
  { id: 'map', label: 'World Map' },
  { id: 'village', label: 'Village' },
  { id: 'journal', label: 'Journal' },
  { id: 'settings', label: 'Settings' },
];

export const SurvivalDrawer: React.FC<SurvivalDrawerProps> = ({
  tab,
  world,
  settings,
  feedback,
  onChangeTab,
  onClose,
  onEquipWeapon,
  onUseConsumable,
  onCraft,
  onSelectBuild,
  onPurchaseOffer,
  onUpdateSettings,
}) => {
  if (!tab) return null;
  const p = world.player;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Survival menu"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/68 p-4 font-hud"
    >
      <div className="w-full max-w-3xl max-h-[84vh] flex flex-col bg-[#101417] border border-[#445053] text-[#e1e9e5] shadow-2xl overflow-hidden">
        {/* Top Tab Strip */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#151a1e] border-b border-[#2c3437] overflow-x-auto">
          <div className="flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onChangeTab(t.id)}
                className={`px-3 py-1.5 text-xs transition-colors whitespace-nowrap shrink-0 ${
                  tab === t.id
                    ? 'bg-[#8ef6e4]/18 text-[#8ef6e4] border border-[#8ef6e4]/50'
                    : 'text-[#b8c4bf] hover:text-[#eef5f0]'
                }`}
              >
                {t.label}
              </button>
            ))}
            {world.merchant.active && (
              <button
                type="button"
                onClick={() => onChangeTab('merchant')}
                className={`px-3 py-1.5 text-xs transition-colors whitespace-nowrap shrink-0 ${
                  tab === 'merchant'
                    ? 'bg-[#ffd166]/20 text-[#ffd166] border border-[#ffd166]/60'
                    : 'text-[#f5d89a] hover:text-[#fff1c9]'
                }`}
              >
                Merchant
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close survival drawer"
            className="px-2.5 py-1 text-xs border border-[#445053] text-[#c5d0cc] hover:text-white shrink-0"
          >
            Close
          </button>
        </div>

        {feedback && (
          <div className="px-4 py-1.5 bg-[#182426] border-b border-[#2f4547] text-xs text-[#8ef6e4]">
            {feedback}
          </div>
        )}

        <div className="p-5 overflow-y-auto observer-scroll flex-1 space-y-5 text-xs">
          {/* INVENTORY & EQUIPMENT */}
          {tab === 'inventory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h2 className="text-sm font-semibold text-[#eef5f0] mb-2">
                  Weapons &amp; Gear (Level {p.level})
                </h2>
                <div className="space-y-2">
                  {p.weapons.map((w) => {
                    const spec = WEAPON_SPECS[w.id];
                    const equipped = p.equippedWeaponId === w.id;
                    const mastery = p.weaponMastery?.[w.id] ?? { xp: 0, level: 1 };
                    return (
                      <div
                        key={w.id}
                        className={`p-3 border flex items-center justify-between gap-2 ${
                          equipped
                            ? 'bg-[#172325] border-[#8ef6e4]/60'
                            : 'bg-[#14191c] border-[#2c3437]'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-[#eef5f0]">
                            {spec.name}{' '}
                            <span className="text-[#95a49f] font-normal">
                              · {spec.tierLabel} · {spec.damage} DMG
                            </span>
                          </div>
                          <div className="text-[11px] text-[#9aa8a3]">{spec.role}</div>
                          <div className="text-[10px] text-[#ffd166] tabular-nums mt-0.5">
                            Mastery Lv {mastery.level}/5 ·{' '}
                            <span className={mastery.level >= 3 ? 'text-[#8ef6e4]' : 'text-[#8e9b97]'}>
                              {spec.masteryPerk}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#8ef6e4] tabular-nums mt-0.5">
                            Durability {w.durability}/{w.maxDurability}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onEquipWeapon(w.id)}
                          disabled={equipped}
                          className="px-3 py-1.5 text-[11px] border border-[#8ef6e4]/50 text-[#8ef6e4] disabled:opacity-45 hover:bg-[#8ef6e4]/15 whitespace-nowrap shrink-0"
                        >
                          {equipped ? 'Equipped' : 'Equip'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <h3 className="text-sm font-semibold text-[#eef5f0] mt-5 mb-2">Consumables</h3>
                <div className="space-y-2">
                  {(
                    [
                      ['cooked_ration', 'Cooked Ration', '+45 Hunger · +30 Stamina'],
                      ['bandage', 'Herbal Bandage', '+42 HP'],
                      ['lantern_oil', 'Lantern Fuel Flask', 'Refills Lantern to 100%'],
                    ] as Array<[ConsumableId, string, string]>
                  ).map(([id, name, desc]) => (
                    <div
                      key={id}
                      className="p-2.5 bg-[#14191c] border border-[#2c3437] flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-[#eef5f0] font-semibold">
                          {name} <span className="text-[#f5d89a] tabular-nums">×{p.consumables[id]}</span>
                        </div>
                        <div className="text-[11px] text-[#9aa8a3]">{desc}</div>
                      </div>
                      <button
                        type="button"
                        disabled={p.consumables[id] <= 0}
                        onClick={() => onUseConsumable(id)}
                        className="px-3 py-1 text-[11px] border border-[#5f6c70] text-[#e1e9e5] hover:border-[#8ef6e4] disabled:opacity-35 whitespace-nowrap shrink-0"
                      >
                        Use
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[#eef5f0] mb-2">Gathered Resources</h2>
                <div className="divide-y divide-[#252d30] border border-[#2c3437] bg-[#14191c]">
                  {(Object.keys(RESOURCE_LABELS) as ResourceKey[]).map((key) => (
                    <div key={key} className="flex items-center justify-between px-3 py-2">
                      <span className="text-[#c8d2ce]">{RESOURCE_LABELS[key]}</span>
                      <span className="font-semibold text-[#eef5f0] tabular-nums">
                        {p.resources[key]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CRAFTING */}
          {tab === 'craft' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CRAFTING_RECIPES.map((r) => {
                const canAfford = hasResources(p.resources, r.cost);
                const structOk =
                  !r.requiresStructure ||
                  p.unlockedRecipes.includes(r.id) ||
                  world.structures.some((s) => !s.destroyed && s.type === r.requiresStructure);
                return (
                  <div
                    key={r.id}
                    className="p-3 bg-[#14191c] border border-[#2c3437] flex flex-col justify-between gap-2.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#eef5f0]">{r.name}</span>
                        <span className="text-[10px] text-[#98a6a1] uppercase">{r.category}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#aeb9b4]">{r.description}</p>
                      <div className="mt-2 text-[11px] text-[#f5d89a]">
                        Cost:{' '}
                        {Object.entries(r.cost)
                          .map(([k, amt]) => `${amt} ${RESOURCE_LABELS[k as ResourceKey]}`)
                          .join(' · ')}
                      </div>
                      {!structOk && r.requiresStructure && (
                        <div className="mt-1 text-[10px] text-[#e08a7e]">
                          Requires {r.requiresStructure.replace('_', ' ')} or field blueprint
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={!canAfford || !structOk}
                      onClick={() => onCraft(r.id)}
                      className="w-full py-1.5 text-xs font-semibold border border-[#8ef6e4]/60 text-[#8ef6e4] hover:bg-[#8ef6e4]/15 disabled:opacity-35 transition-colors"
                    >
                      Craft
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* BUILDING */}
          {tab === 'build' && (
            <div>
              <p className="text-[#aeb9b4] mb-3">
                Select a structure to place in the world. Press <strong className="text-[#8ef6e4]">E</strong> near existing walls or stations to repair or upgrade them to Tier 2 &amp; Tier 3.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {BUILDABLE_STRUCTURES.map((bp) => {
                  const canAfford = hasResources(p.resources, bp.cost);
                  return (
                    <div
                      key={bp.type}
                      className="p-3 bg-[#14191c] border border-[#2c3437] flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="font-semibold text-[#eef5f0]">{bp.name}</div>
                        <div className="text-[11px] text-[#9faea8] mt-0.5">{bp.role}</div>
                        <div className="text-[10px] text-[#85a09a] mt-1">{bp.upgradeNote}</div>
                        <div className="text-[11px] text-[#f5d89a] mt-2">
                          {Object.entries(bp.cost)
                            .map(([k, amt]) => `${amt} ${RESOURCE_LABELS[k as ResourceKey]}`)
                            .join(' · ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onSelectBuild(bp.type)}
                        className="w-full py-1.5 text-xs font-semibold border border-[#8ef6e4]/60 text-[#8ef6e4] hover:bg-[#8ef6e4]/15 disabled:opacity-35 transition-colors"
                      >
                        Place Structure
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* LIVE WORLD MAP */}
          {tab === 'map' && (
            <div className="space-y-3">
              <div className="border border-[#333d40] bg-[#0b0e10] p-2">
                <svg
                  viewBox={`0 0 ${world.worldWidth} ${world.worldHeight}`}
                  className="w-full h-[360px] bg-[#14181b]"
                  aria-label="Live open world map"
                >
                  {world.regions.map((r) => (
                    <g key={r.id}>
                      <circle
                        cx={r.x}
                        cy={r.y}
                        r={r.radius}
                        fill={r.discovered ? 'rgba(142, 246, 228, 0.08)' : 'rgba(10, 12, 14, 0.65)'}
                        stroke={r.discovered ? 'rgba(142, 246, 228, 0.35)' : 'rgba(90, 96, 100, 0.25)'}
                        strokeWidth={10}
                      />
                      <text
                        x={r.x}
                        y={r.y - 24}
                        textAnchor="middle"
                        fill={r.discovered ? '#dce8e3' : '#65706e'}
                        fontSize={68}
                        fontFamily="monospace"
                      >
                        {r.discovered
                          ? `${r.zoneLabel ? `${r.zoneLabel}: ` : ''}${r.name}`
                          : r.zoneLabel
                            ? `${r.zoneLabel} · Unexplored`
                            : 'Unexplored'}
                      </text>
                    </g>
                  ))}

                  {/* Structures */}
                  {world.structures
                    .filter((s) => !s.destroyed)
                    .map((s) => (
                      <rect
                        key={s.id}
                        x={s.x - 18}
                        y={s.y - 18}
                        width={36}
                        height={36}
                        fill={
                          s.type === 'crt_tv'
                            ? '#8ef6e4'
                            : s.type === 'brazier_beacon'
                              ? '#ffd166'
                              : s.type === 'tesla_pylon'
                                ? '#72f2ff'
                                : '#9c9689'
                        }
                      />
                    ))}

                  {/* Traveling Night Merchant */}
                  {world.merchant.active && (
                    <rect
                      x={world.merchant.x - 28}
                      y={world.merchant.y - 28}
                      width={56}
                      height={56}
                      fill="#ffd166"
                      stroke="#101417"
                      strokeWidth={10}
                    />
                  )}

                  {/* Trapped Survivors */}
                  {world.trappedSurvivors
                    .filter((s) => s.state !== 'RECRUITED')
                    .map((s) => (
                      <circle
                        key={s.id}
                        cx={s.x}
                        cy={s.y}
                        r={32}
                        fill="none"
                        stroke="#ffd166"
                        strokeWidth={12}
                      />
                    ))}

                  {/* Ancient Shrines */}
                  {world.shrines
                    .filter((sh) => !sh.used)
                    .map((sh) => (
                      <polygon
                        key={sh.id}
                        points={`${sh.x},${sh.y - 36} ${sh.x + 30},${sh.y} ${sh.x},${sh.y + 36} ${sh.x - 30},${sh.y}`}
                        fill="#e05858"
                      />
                    ))}

                  {/* Watcher's Eye Relic reveals Ancient Shard outcrops */}
                  {world.activeRelics.includes('watchers_eye') &&
                    world.resourceNodes
                      .filter((n) => !n.depleted && n.kind === 'crystal_outcrop')
                      .map((n) => (
                        <circle key={n.id} cx={n.x} cy={n.y} r={24} fill="#72f2ff" />
                      ))}

                  {/* Villagers */}
                  {world.villagers
                    .filter((v) => v.alive)
                    .map((v) => (
                      <circle key={v.id} cx={v.x} cy={v.y} r={22} fill="#f5d89a" />
                    ))}

                  {/* Active Monsters */}
                  {world.monsters
                    .filter((m) => m.state !== 'DYING' && (m.mimicRevealed || world.activeRelics.includes('watchers_eye')))
                    .map((m) => (
                      <circle
                        key={m.id}
                        cx={m.x}
                        cy={m.y}
                        r={m.isBoss ? 52 : 28}
                        fill={m.isBoss ? '#ff4d4d' : '#e05858'}
                      />
                    ))}

                  {/* Player */}
                  <circle cx={p.x} cy={p.y} r={38} fill="#8ef6e4" stroke="#0b0e10" strokeWidth={12} />
                </svg>
              </div>
              <div className="flex flex-wrap gap-4 text-[11px] text-[#aeb9b4]">
                <span className="text-[#8ef6e4]">Cyan: You</span>
                <span className="text-[#ffd166]">Amber Ring: Trapped Survivors</span>
                <span className="text-[#e05858]">Red Diamond: Ancient Shrines</span>
                <span>
                  Regions: {world.regions.filter((r) => r.discovered).length}/{world.regions.length}
                </span>
              </div>
            </div>
          )}

          {/* TRAVELING NIGHT MERCHANT */}
          {tab === 'merchant' && (
            <div className="space-y-4">
              <div className="p-3 bg-[#1a1814] border border-[#6e5c3e] text-[#f5dfaf]">
                <div className="font-semibold text-sm text-[#ffd166]">Traveling Night Merchant</div>
                <p className="text-[11px] text-[#d9cba9] mt-1">
                  &ldquo;Trade quickly before dusk falls—I roll my lantern cart back into the mist at evening.&rdquo;
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {world.merchant.offers.map((offer) => {
                  const canAfford = !offer.purchased && hasResources(p.resources, offer.cost);
                  return (
                    <div
                      key={offer.id}
                      className="p-3.5 bg-[#14191c] border border-[#353f42] flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-[#eef5f0]">{offer.name}</div>
                        <p className="mt-1 text-[11px] text-[#aeb9b4]">{offer.description}</p>
                        <div className="mt-2 text-[11px] text-[#ffd166]">
                          Cost:{' '}
                          {Object.entries(offer.cost)
                            .map(([k, amt]) => `${amt} ${RESOURCE_LABELS[k as ResourceKey]}`)
                            .join(' · ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onPurchaseOffer(offer.id)}
                        className="w-full py-1.5 text-xs font-semibold border border-[#ffd166]/65 text-[#ffd166] hover:bg-[#ffd166]/15 disabled:opacity-35 transition-colors"
                      >
                        {offer.purchased ? 'Traded' : 'Trade'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VILLAGE ROSTER & STATUS */}
          {tab === 'village' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#cfd8d4] pb-2 border-b border-[#252d30]">
                <span>
                  Surviving Villagers:{' '}
                  <strong className="text-[#8ef6e4] tabular-nums">
                    {world.villagers.filter((v) => v.alive).length}/{world.villagers.length}
                  </strong>
                </span>
                <span>
                  Active Defenses:{' '}
                  <strong className="text-[#f5d89a] tabular-nums">
                    {world.structures.filter((s) => !s.destroyed).length}
                  </strong>
                </span>
                <span>
                  Monsters Slain:{' '}
                  <strong className="text-[#eef5f0] tabular-nums">{world.monstersSlain}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {world.villagers.map((v) => (
                  <div
                    key={v.id}
                    className={`p-3 border ${
                      v.alive ? 'bg-[#14191c] border-[#2c3437]' : 'bg-[#1a1314] border-[#4c2828] opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#eef5f0]">
                        {v.name} <span className="text-[#94a39f] font-normal">· {v.role}</span>
                      </span>
                      <span className={v.alive ? 'text-[#8ef6e4] tabular-nums' : 'text-[#e06a62]'}>
                        {v.alive ? `HP ${Math.round(v.hp)}/${v.maxHp}` : 'FALLEN'}
                      </span>
                    </div>
                    {v.alive && (
                      <>
                        <div className="mt-1 text-[11px] text-[#f5d89a]">{v.intentLabel}</div>
                        <div className="mt-1 text-[10px] text-[#98a6a1] tabular-nums">
                          Courage {v.courage} · Fear {Math.round(v.fear)} · Combat {v.skills.combat} · Build {v.skills.building}
                        </div>
                        {v.memories[0] && (
                          <div className="mt-1.5 text-[10px] text-[#7f8e89] italic">
                            Memory: &ldquo;{v.memories[0].text}&rdquo;
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DISCOVERY JOURNAL & EVENT LOG */}
          {tab === 'journal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <h2 className="text-sm font-semibold text-[#eef5f0] mb-2">
                  Central Mystery Discoveries ({world.discoveries.length})
                </h2>
                <div className="space-y-2.5">
                  {world.discoveries.map((d) => (
                    <div key={d.id} className="p-3 bg-[#14191c] border border-[#2c3437]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#f5d89a]">{d.title}</span>
                        <span className="text-[10px] text-[#85948f]">Day {d.dayFound}</span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-[#ccd6d2]">{d.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[#eef5f0] mb-2">Recent Village Chronicle</h2>
                <div className="space-y-1.5">
                  {world.eventLog.slice(0, 16).map((ev) => (
                    <div key={ev.id} className="p-2 bg-[#14191c] border border-[#252d30] text-[11px]">
                      <span className="text-[#85948f] mr-2">
                        Day {ev.day} {ev.timeText}
                      </span>
                      <span
                        className={
                          ev.severity === 'horror'
                            ? 'text-[#f5d89a]'
                            : ev.severity === 'combat'
                              ? 'text-[#f08b82]'
                              : 'text-[#dce5e0]'
                        }
                      >
                        {ev.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {tab === 'settings' && (
            <div className="space-y-4 max-w-lg">
              <label className="flex items-center justify-between p-3 bg-[#14191c] border border-[#2c3437]">
                <span>Atmospheric Film Grain</span>
                <input
                  type="checkbox"
                  checked={settings.filmGrain}
                  onChange={(e) => onUpdateSettings({ filmGrain: e.target.checked })}
                  className="accent-[#8ef6e4]"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-[#14191c] border border-[#2c3437]">
                <span>Night Fog &amp; Weather Particles</span>
                <input
                  type="checkbox"
                  checked={settings.fogEffects}
                  onChange={(e) => onUpdateSettings({ fogEffects: e.target.checked })}
                  className="accent-[#8ef6e4]"
                />
              </label>

              <div className="flex items-center justify-between p-3 bg-[#14191c] border border-[#2c3437]">
                <span>Mobile Touch Controls</span>
                <select
                  value={settings.showTouchControls}
                  onChange={(e) =>
                    onUpdateSettings({
                      showTouchControls: e.target.value as GameSettings['showTouchControls'],
                    })
                  }
                  className="bg-[#0e1215] border border-[#3d474a] px-2 py-1 text-xs text-[#e1e9e5]"
                >
                  <option value="auto">Auto (Mobile / Touch)</option>
                  <option value="always">Always On</option>
                  <option value="off">Off</option>
                </select>
              </div>

              <div className="p-3 bg-[#14191c] border border-[#2c3437] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span>Master Volume</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.masterVol}
                    onChange={(e) => onUpdateSettings({ masterVol: Number(e.target.value) })}
                    className="w-40 accent-[#8ef6e4]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>Ambient Atmosphere</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.ambientVol}
                    onChange={(e) => onUpdateSettings({ ambientVol: Number(e.target.value) })}
                    className="w-40 accent-[#8ef6e4]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>Combat &amp; World SFX</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.sfxVol}
                    onChange={(e) => onUpdateSettings({ sfxVol: Number(e.target.value) })}
                    className="w-40 accent-[#8ef6e4]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
