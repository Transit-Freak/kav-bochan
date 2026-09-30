// Simple line icons (stroke-based, currentColor). Kept geometric — no figurative art.
function Icon({ d, size = 24, sw = 2, fill = 'none', children, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {d ? <path d={d} /> : children}
    </svg>
  );
}

const IconSearch  = (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>;
const IconBus     = (p) => <Icon {...p}><rect x="4" y="3" width="16" height="14" rx="2.5"/><path d="M4 11h16"/><path d="M7 21v-2M17 21v-2"/><circle cx="8" cy="14.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="16" cy="14.5" r="0.6" fill="currentColor" stroke="none"/></Icon>;
const IconPin     = (p) => <Icon {...p}><path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></Icon>;
const IconClock   = (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></Icon>;
const IconList    = (p) => <Icon {...p}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></Icon>;
const IconMap     = (p) => <Icon {...p}><path d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z"/><path d="M9 4v13M15 6.5v13"/></Icon>;
const IconChevron = (p) => <Icon {...p}><path d="M15 5l-7 7 7 7"/></Icon>;
const IconChevDown= (p) => <Icon {...p}><path d="M6 9l6 6 6-6"/></Icon>;
const IconX       = (p) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18"/></Icon>;
const IconUpload  = (p) => <Icon {...p}><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></Icon>;
const IconCheck   = (p) => <Icon {...p}><path d="M4 12l5 5L20 6"/></Icon>;
const IconSun     = (p) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></Icon>;
const IconMoon    = (p) => <Icon {...p}><path d="M21 12.8A8 8 0 1111.2 3 6.3 6.3 0 0021 12.8z"/></Icon>;
const IconNav     = (p) => <Icon {...p}><path d="M3 11l18-8-8 18-2-7-8-3z"/></Icon>;
const IconAlert   = (p) => <Icon {...p}><path d="M12 3l9 16H3l9-16z"/><path d="M12 10v4M12 17h.01"/></Icon>;
const IconFlag    = (p) => <Icon {...p}><path d="M5 21V4M5 4h11l-1.5 3.5L16 11H5"/></Icon>;
const IconStraight  = (p) => <Icon {...p} sw={2.4}><path d="M12 21V6M6.5 11.5L12 6l5.5 5.5"/></Icon>;
const IconTurnRight = (p) => <Icon {...p} sw={2.4}><path d="M8 21v-8a4 4 0 014-4h5M13.5 4.5L18 9l-4.5 4.5"/></Icon>;
const IconTurnLeft  = (p) => <Icon {...p} sw={2.4}><path d="M16 21v-8a4 4 0 00-4-4H7M10.5 4.5L6 9l4.5 4.5"/></Icon>;
// roundabout: enter from bottom, loop, exit upper-right (2nd exit feel)
const IconRoundabout = (p) => <Icon {...p} sw={2.4}><path d="M9 21v-5.5"/><circle cx="9" cy="10" r="4.5"/><path d="M13.2 8.3l4.3-2M14.6 3.2l3 .8-.8 3"/></Icon>;

Object.assign(window, {
  IconSearch, IconBus, IconPin, IconClock, IconList, IconMap, IconChevron,
  IconChevDown, IconX, IconUpload, IconCheck, IconSun, IconMoon, IconNav, IconAlert, IconFlag,
  IconStraight, IconTurnRight, IconTurnLeft, IconRoundabout,
});
