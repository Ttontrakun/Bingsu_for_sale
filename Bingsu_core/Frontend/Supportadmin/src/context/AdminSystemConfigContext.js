import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

const styleToCss = (style) => {
  if (!style || typeof style !== 'object') return {};
  const css = {};
  if (style.color) css.color = style.color;
  if (style.backgroundColor) css.backgroundColor = style.backgroundColor;
  if (style.fontSize) css.fontSize = `${style.fontSize}px`;
  if (style.bold === true) css.fontWeight = 700;
  if (style.italic === true) css.fontStyle = 'italic';
  if (style.underline === true) css.textDecoration = 'underline';
  return css;
};

export const AdminSystemConfigContext = createContext({
  ready: false,
  menus: { admin: [], systemTabs: [] },
  features: {},
  copy: {},
  styles: {},
  menuEnabled: () => true,
  systemTabEnabled: () => true,
  getCopy: (_key, fallback = '') => fallback,
  getTextStyle: () => ({}),
  reload: () => {},
});

export function textStyleToCss(style) {
  return styleToCss(style);
}

export function AdminSystemConfigProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [menus, setMenus] = useState({ admin: [], systemTabs: [] });
  const [features, setFeatures] = useState({});
  const [copy, setCopy] = useState({});
  const [styles, setStyles] = useState({});

  const reload = useCallback(async () => {
    try {
      const data = await api.getPublicConfig();
      setMenus({
        admin: Array.isArray(data?.menus?.admin) ? data.menus.admin : [],
        systemTabs: Array.isArray(data?.menus?.systemTabs) ? data.menus.systemTabs : [],
      });
      setFeatures(data?.features && typeof data.features === 'object' ? data.features : {});
      setCopy(data?.copy && typeof data.copy === 'object' ? data.copy : {});
      setStyles(data?.styles && typeof data.styles === 'object' ? data.styles : {});
    } catch {
      setMenus({ admin: [], systemTabs: [] });
      setFeatures({});
      setCopy({});
      setStyles({});
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const menuEnabled = useCallback(
    (id) => {
      const list = menus.admin || [];
      if (!list.length) return true;
      const entry = list.find((m) => m.id === id);
      return entry ? entry.enabled !== false : true;
    },
    [menus],
  );

  const systemTabEnabled = useCallback(
    (id) => {
      const list = menus.systemTabs || [];
      if (!list.length) return true;
      const entry = list.find((m) => m.id === id);
      return entry ? entry.enabled !== false : true;
    },
    [menus],
  );

  const getCopy = useCallback(
    (key, fallback = '') => {
      const value = copy?.[key];
      if (value == null || value === '') return fallback;
      return String(value);
    },
    [copy],
  );

  const getTextStyle = useCallback((key) => styleToCss(styles?.[key]), [styles]);

  const value = useMemo(
    () => ({
      ready,
      menus,
      features,
      copy,
      styles,
      menuEnabled,
      systemTabEnabled,
      getCopy,
      getTextStyle,
      reload,
    }),
    [ready, menus, features, copy, styles, menuEnabled, systemTabEnabled, getCopy, getTextStyle, reload],
  );

  return (
    <AdminSystemConfigContext.Provider value={value}>
      {children}
    </AdminSystemConfigContext.Provider>
  );
}

export function useAdminSystemConfig() {
  return useContext(AdminSystemConfigContext);
}
