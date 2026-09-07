import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HiDesktopComputer, HiRefresh, HiPlus, HiCheck } from 'react-icons/hi';
import { api } from '../services/api';
import { useAdminSystemConfig } from '../context/AdminSystemConfigContext';
import { PAGE_BY_MENU, ADMIN_PAGE_META, pageForCopyKey, resolveAssetUrl } from './devStudio/helpers';
import MenuToggle from './devStudio/MenuToggle';
import StyleEditor from './devStudio/StyleEditor';
import { SupportAdminShellPreview, SupportAdminLoginPreview } from './devStudio/adminPreview';
import { UserLoginPreview, VerifyingPreview, EmailVerifyDocPreview, ShellPreview } from './devStudio/userPreview';

function DevStudio() {
  const { reload: reloadPublicConfig } = useAdminSystemConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const surface = searchParams.get('surface') === 'supportadmin' ? 'supportadmin' : 'user';
  const setSurface = (next) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'supportadmin') params.set('surface', 'supportadmin');
    else params.delete('surface');
    setSearchParams(params, { replace: true });
  };

  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pageId, setPageId] = useState('homepage');
  const [adminPageId, setAdminPageId] = useState('dashboard');
  const [systemTabId, setSystemTabId] = useState('announce');
  const [selectedKey, setSelectedKey] = useState('user.homepage.title');
  const [rightTab, setRightTab] = useState('text');
  const [searchOpen, setSearchOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getDevConfig();
      setConfig(data);
      setDraft({
        copy: { ...(data.copy || {}) },
        styles: { ...(data.styles || {}) },
        menus: {
          user: (data.menus?.user || []).map((m) => ({ ...m })),
          admin: (data.menus?.admin || []).map((m) => ({ ...m })),
          systemTabs: (data.menus?.systemTabs || []).map((m) => ({ ...m })),
        },
        branding: { ...(data.branding || {}) },
        features: { ...(data.features || {}) },
      });
    } catch (err) {
      setError(err?.message || 'โหลด config ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (surface === 'supportadmin') {
      setSearchOpen(false);
      setAdminPageId((prev) => (prev && ADMIN_PAGE_META[prev] ? prev : 'dashboard'));
      if (!String(selectedKey || '').startsWith('admin.')) {
        setSelectedKey('admin.dashboard.title');
      }
    } else if (!String(selectedKey || '').startsWith('user.')) {
      setSelectedKey('user.homepage.title');
    }
  }, [surface]); // eslint-disable-line react-hooks/exhaustive-deps

  const catalogMenus = useMemo(() => config?.catalog?.userMenus || [], [config]);
  const catalogAdminMenus = useMemo(() => config?.catalog?.adminMenus || [], [config]);
  const catalogSystemTabs = useMemo(() => config?.catalog?.systemTabs || [], [config]);
  const copyKeys = useMemo(() => config?.catalog?.copyKeys || [], [config]);

  const previewMenus = useMemo(() => {
    const enabledMap = new Map((draft?.menus?.user || []).map((m) => [m.id, m.enabled !== false]));
    return catalogMenus.map((m) => ({
      ...m,
      enabled: enabledMap.has(m.id) ? enabledMap.get(m.id) : true,
    }));
  }, [catalogMenus, draft]);

  const previewAdminMenus = useMemo(() => {
    const enabledMap = new Map((draft?.menus?.admin || []).map((m) => [m.id, m.enabled !== false]));
    return catalogAdminMenus.map((m) => ({
      ...m,
      enabled: enabledMap.has(m.id) ? enabledMap.get(m.id) : true,
    }));
  }, [catalogAdminMenus, draft]);

  const previewSystemTabs = useMemo(() => {
    const enabledMap = new Map(
      (draft?.menus?.systemTabs || []).map((m) => [m.id, m.enabled !== false]),
    );
    return catalogSystemTabs.map((m) => ({
      ...m,
      enabled: enabledMap.has(m.id) ? enabledMap.get(m.id) : true,
    }));
  }, [catalogSystemTabs, draft]);

  const selectedMeta = useMemo(
    () => copyKeys.find((k) => k.key === selectedKey) || copyKeys[0] || null,
    [copyKeys, selectedKey],
  );

  useEffect(() => {
    if (!selectedKey && copyKeys[0]?.key) setSelectedKey(copyKeys[0].key);
  }, [copyKeys, selectedKey]);

  const dirty = useMemo(() => {
    if (!config || !draft) return false;
    return (
      JSON.stringify({
        copy: config.copy,
        styles: config.styles || {},
        menus: config.menus,
        branding: config.branding,
      }) !==
      JSON.stringify({
        copy: draft.copy,
        styles: draft.styles || {},
        menus: draft.menus,
        branding: draft.branding,
      })
    );
  }, [config, draft]);

  const setCopyValue = (key, value) => {
    setDraft((prev) => ({ ...prev, copy: { ...prev.copy, [key]: value } }));
  };

  const setStyleValue = (key, style) => {
    setDraft((prev) => {
      const next = { ...(prev.styles || {}) };
      if (!style || Object.keys(style).length === 0) delete next[key];
      else next[key] = style;
      return { ...prev, styles: next };
    });
  };

  const toggleMenuList = (listKey, menuId, enabled) => {
    setDraft((prev) => {
      const current = prev.menus?.[listKey] || [];
      const exists = current.some((m) => m.id === menuId);
      const nextList = exists
        ? current.map((m) => (m.id === menuId ? { ...m, enabled } : m))
        : [...current, { id: menuId, enabled }];
      return { ...prev, menus: { ...prev.menus, [listKey]: nextList } };
    });
  };

  const toggleUserMenu = (menuId, enabled) => toggleMenuList('user', menuId, enabled);
  const toggleAdminMenu = (menuId, enabled) => toggleMenuList('admin', menuId, enabled);
  const toggleSystemTab = (tabId, enabled) => toggleMenuList('systemTabs', tabId, enabled);

  const handleSelectText = (key) => {
    setSelectedKey(key);
    setRightTab('text');
    if (String(key || '').startsWith('admin.')) {
      const nextAdmin = pageForCopyKey(key);
      if (nextAdmin) setAdminPageId(nextAdmin);
      if (surface !== 'supportadmin') setSurface('supportadmin');
      return;
    }
    const nextPage = pageForCopyKey(key);
    if (nextPage) {
      if (key.startsWith('user.search.')) setSearchOpen(true);
      else setSearchOpen(false);
      setPageId(nextPage === 'search' ? 'homepage' : nextPage);
      if (surface !== 'user') setSurface('user');
    }
  };

  const handleMenuClick = (menuId) => {
    if (menuId === 'history') {
      setSearchOpen(true);
      return;
    }
    setSearchOpen(false);
    setPageId(PAGE_BY_MENU[menuId] || 'homepage');
  };

  const handleAdminMenuClick = (menuId) => {
    setAdminPageId(menuId);
    if (menuId === 'system') {
      setRightTab('menus');
      setSelectedKey('admin.system.title');
    } else if (ADMIN_PAGE_META[menuId]?.titleKey) {
      setSelectedKey(ADMIN_PAGE_META[menuId].titleKey);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await api.patchDevConfig({
        copy: draft.copy,
        styles: draft.styles,
        menus: draft.menus,
        branding: draft.branding,
      });
      setConfig((prev) => ({ ...prev, ...saved, catalog: prev?.catalog }));
      setDraft({
        copy: { ...(saved.copy || {}) },
        styles: { ...(saved.styles || {}) },
        menus: {
          user: (saved.menus?.user || []).map((m) => ({ ...m })),
          admin: (saved.menus?.admin || []).map((m) => ({ ...m })),
          systemTabs: (saved.menus?.systemTabs || []).map((m) => ({ ...m })),
        },
        branding: { ...(saved.branding || {}) },
        features: { ...(saved.features || {}) },
      });
      await reloadPublicConfig();
      setNotice('บันทึกแล้ว');
    } catch (err) {
      setError(err?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file) => {
    if (!file) return;
    setError('');
    setNotice('');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });
      const result = await api.uploadDevLogo(dataUrl);
      setDraft((prev) => ({
        ...prev,
        branding: { ...prev.branding, logoUrl: result.logoUrl },
      }));
      setConfig((prev) =>
        prev
          ? { ...prev, branding: { ...(prev.branding || {}), ...(result.branding || {}) } }
          : prev,
      );
      await reloadPublicConfig();
      setNotice('อัปโหลดโลโก้แล้ว');
    } catch (err) {
      setError(err?.message || 'อัปโหลดโลโก้ไม่สำเร็จ');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        กำลังโหลด Dev Studio...
      </div>
    );
  }

  if (error && !draft) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm">
        <p className="text-red-600">{error}</p>
        <button type="button" onClick={load} className="px-4 py-2 rounded-lg bg-gray-900 text-white">
          ลองใหม่
        </button>
      </div>
    );
  }

  const activeTextKey = selectedMeta?.key || selectedKey;

  return (
    <div className="flex flex-col h-full min-h-0 -mx-2">
      <div className="flex items-center justify-between gap-4 px-2 pb-4 border-b border-gray-100 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <HiDesktopComputer className="text-amber-500 text-xl shrink-0" />
            <h1 className="text-lg font-semibold text-gray-900 truncate">Dev Studio</h1>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 ml-7">
            {surface === 'supportadmin'
              ? 'พรีวิว Supportadmin — เปิด/ปิดเมนูและแท็บ System ได้จากแผงขวา'
              : 'คลิกข้อความใน preview เพื่อแก้ — หรือเลือกจากแผงขวา'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            title="รีโหลด"
          >
            <HiRefresh />
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm bg-gray-900 text-white disabled:opacity-35"
          >
            <HiCheck />
            {saving ? 'บันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div
          className={`mx-2 mb-3 text-sm px-3 py-2 rounded-lg ${
            error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {error || notice}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-4 px-2">
        <div className="col-span-9 min-h-0 overflow-auto">
          <div className="mb-4 space-y-2">
            {surface === 'user' ? (
              (() => {
                const AUTH_PAGES = new Set(['login', 'verify', 'email']);
                const root = AUTH_PAGES.has(pageId) ? 'login' : 'homepage';
                const authSubs = [
                  { id: 'login', label: 'Login' },
                  { id: 'verify', label: 'Verify' },
                  { id: 'email', label: 'อีเมลยืนยัน' },
                ];
                const appSubs = [
                  { id: 'homepage', label: 'Homepage' },
                  { id: 'private', label: 'Personal' },
                  { id: 'bots', label: 'Bots' },
                  { id: 'knowledge', label: 'Knowledge' },
                ];
                const subs = root === 'login' ? authSubs : appSubs;
                return (
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1">
                      {[
                        { id: 'login', label: 'Login' },
                        { id: 'homepage', label: 'Homepage' },
                      ].map((p) => {
                        const active = p.id === root;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              setPageId(p.id);
                            }}
                            className={`h-8 px-4 rounded-full text-xs font-medium transition ${
                              active
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-800'
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-1">
                      {subs.map((p) => {
                        const active = pageId === p.id && !searchOpen;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              setPageId(p.id);
                            }}
                            className={`h-7 px-3 rounded-md text-xs transition ${
                              active
                                ? 'bg-gray-900 text-white'
                                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1">
                  {[
                    { id: 'login', label: 'Login' },
                    { id: 'app', label: 'หน้าแอป' },
                  ].map((p) => {
                    const active =
                      p.id === 'login' ? adminPageId === 'login' : adminPageId !== 'login';
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (p.id === 'login') {
                            setAdminPageId('login');
                            setSelectedKey('admin.login.titleLine1');
                            setRightTab('text');
                          } else if (adminPageId === 'login') {
                            setAdminPageId('dashboard');
                            setSelectedKey('admin.dashboard.title');
                          }
                        }}
                        className={`h-8 px-4 rounded-full text-xs font-medium transition ${
                          active
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 pl-1">
                  {adminPageId === 'login'
                    ? 'คลิกชื่อบนการ์ด Login เพื่อแก้ข้อความ — หรือใช้แผงขวา'
                    : 'คลิกเมนูใน sidebar ของพรีวิวเพื่อสลับหน้า — คลิกข้อความเพื่อแก้ไข'}
                </p>
              </div>
            )}
          </div>

          {surface === 'supportadmin' ? (
            adminPageId === 'login' ? (
              <SupportAdminLoginPreview
                branding={draft.branding}
                copy={draft.copy}
                styles={draft.styles}
                selectedKey={selectedKey}
                onSelect={handleSelectText}
              />
            ) : (
              <SupportAdminShellPreview
                branding={draft.branding}
                menus={previewAdminMenus}
                systemTabs={previewSystemTabs}
                pageId={adminPageId}
                systemTabId={systemTabId}
                onMenuClick={handleAdminMenuClick}
                onSelectSystemTab={setSystemTabId}
                copy={draft.copy}
                styles={draft.styles}
                selectedKey={selectedKey}
                onSelect={handleSelectText}
              />
            )
          ) : pageId === 'login' ? (
            <UserLoginPreview
              copy={draft.copy}
              styles={draft.styles}
              branding={draft.branding}
              selectedKey={selectedKey}
              onSelect={handleSelectText}
              onGoVerify={() => setPageId('verify')}
            />
          ) : pageId === 'verify' ? (
            <VerifyingPreview
              copy={draft.copy}
              styles={draft.styles}
              selectedKey={selectedKey}
              onSelect={handleSelectText}
              onBackLogin={() => setPageId('login')}
            />
          ) : pageId === 'email' ? (
            <EmailVerifyDocPreview
              copy={draft.copy}
              styles={draft.styles}
              branding={draft.branding}
              selectedKey={selectedKey}
              onSelect={handleSelectText}
            />
          ) : (
            <ShellPreview
              pageId={pageId}
              copy={draft.copy}
              styles={draft.styles}
              branding={draft.branding}
              menus={previewMenus}
              onMenuClick={handleMenuClick}
              searchOpen={searchOpen}
              onCloseSearch={() => setSearchOpen(false)}
              selectedKey={selectedKey}
              onSelect={handleSelectText}
            />
          )}
        </div>

        <div className="col-span-3 min-h-0 flex flex-col border border-gray-200 rounded-2xl bg-white overflow-hidden">
          <div className="flex border-b border-gray-100">
            {[
              { id: 'text', label: 'ข้อความ' },
              { id: 'brand', label: 'แบรนด์' },
              { id: 'menus', label: surface === 'supportadmin' && adminPageId === 'system' ? 'แท็บ System' : 'เมนู' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRightTab(tab.id)}
                className={`flex-1 text-xs py-2.5 font-bold transition ${
                  rightTab === tab.id
                    ? 'text-gray-900 border-b-2 border-amber-400'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-3">
            {rightTab === 'text' && (
              <div className="space-y-3">
                <label className="block text-[11px] text-gray-500 space-y-1">
                  <span className="font-bold text-gray-700">เลือกข้อความ</span>
                  <select
                    value={activeTextKey || ''}
                    onChange={(e) => handleSelectText(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white"
                  >
                    {copyKeys
                      .filter((k) =>
                        surface === 'supportadmin'
                          ? String(k.key).startsWith('admin.')
                          : String(k.key).startsWith('user.'),
                      )
                      .map((k) => (
                      <option key={k.key} value={k.key}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedMeta ? (
                  <>
                    <p className="text-[10px] text-gray-400 font-mono break-all">{selectedMeta.key}</p>
                    <textarea
                      rows={4}
                      value={draft.copy?.[selectedMeta.key] ?? ''}
                      onChange={(e) => setCopyValue(selectedMeta.key, e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                    />
                    <StyleEditor
                      value={draft.styles?.[selectedMeta.key]}
                      onChange={(style) => setStyleValue(selectedMeta.key, style)}
                    />
                  </>
                ) : (
                  <p className="text-sm text-gray-400 py-8 text-center">ไม่มีรายการข้อความ</p>
                )}
              </div>
            )}

            {rightTab === 'brand' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">โลโก้</label>
                  <div className="flex flex-col items-start gap-2">
                    <img
                      src={resolveAssetUrl(draft.branding?.logoUrl)}
                      alt=""
                      className="w-16 h-16 rounded-full object-cover border border-gray-200"
                    />
                    <label className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 w-fit">
                      <HiPlus />
                      อัปโหลด
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                      />
                    </label>
                    {draft.branding?.logoUrl && (
                      <button
                        type="button"
                        className="text-xs text-red-500 text-left"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            branding: { ...prev.branding, logoUrl: null },
                          }))
                        }
                      >
                        ใช้โลโก้เริ่มต้น
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">ชื่อแอป</label>
                  <input
                    type="text"
                    value={draft.branding?.appName || ''}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        branding: { ...prev.branding, appName: e.target.value },
                      }))
                    }
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
              </div>
            )}

            {rightTab === 'menus' && (
              <div className="space-y-4">
                {surface === 'user' ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-gray-700 mb-2 leading-relaxed">
                      เปิด/ปิดเมนู User — Chats = ค้นหาแชท
                    </p>
                    {catalogMenus.map((menu) => {
                      const entry = (draft.menus?.user || []).find((m) => m.id === menu.id);
                      const enabled = entry ? entry.enabled !== false : true;
                      return (
                        <div
                          key={menu.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-gray-50"
                        >
                          <button
                            type="button"
                            className="text-xs text-gray-800 text-left hover:underline leading-snug"
                            onClick={() => handleMenuClick(menu.id)}
                          >
                            {menu.label}
                          </button>
                          <MenuToggle
                            enabled={enabled}
                            onChange={(next) => toggleUserMenu(menu.id, next)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : adminPageId === 'login' ? (
                  <div className="rounded-xl bg-amber-50/70 border border-amber-100 px-3 py-3 space-y-1">
                    <p className="text-[11px] font-bold text-gray-800 leading-relaxed">หน้า Login</p>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      ไม่มีเมนู Sidebar — แก้ชื่อบนการ์ดได้ที่แท็บข้อความ หรือคลิกบนพรีวิวโดยตรง
                    </p>
                  </div>
                ) : adminPageId === 'system' ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-gray-700 leading-relaxed">
                      แท็บในหน้า System (ถอดออกได้) — แสดงเฉพาะตอนพรีวิวหน้า System
                    </p>
                    {catalogSystemTabs.map((tab) => {
                      const entry = (draft.menus?.systemTabs || []).find((m) => m.id === tab.id);
                      const enabled = entry ? entry.enabled !== false : true;
                      return (
                        <div
                          key={tab.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-amber-50/60"
                        >
                          <button
                            type="button"
                            className="text-xs text-gray-800 text-left hover:underline leading-snug"
                            onClick={() => setSystemTabId(tab.id)}
                          >
                            {tab.label}
                          </button>
                          <MenuToggle
                            enabled={enabled}
                            onChange={(next) => toggleSystemTab(tab.id, next)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-gray-700 leading-relaxed">
                      เมนู Sidebar Supportadmin
                    </p>
                    {catalogAdminMenus.map((menu) => {
                      const entry = (draft.menus?.admin || []).find((m) => m.id === menu.id);
                      const enabled = entry ? entry.enabled !== false : true;
                      return (
                        <div
                          key={menu.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-gray-50"
                        >
                          <button
                            type="button"
                            className="text-xs text-gray-800 text-left hover:underline leading-snug"
                            onClick={() => handleAdminMenuClick(menu.id)}
                          >
                            {menu.label}
                          </button>
                          <MenuToggle
                            enabled={enabled}
                            onChange={(next) => toggleAdminMenu(menu.id, next)}
                          />
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-gray-400 pt-2 leading-relaxed">
                      แท็บในหน้า System จะแสดงเมื่อกดเมนู System ในพรีวิว
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DevStudio;
