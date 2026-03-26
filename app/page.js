"use client"
import { useSession, signIn, signOut } from "next-auth/react"
import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react"
import DOMPurify from "dompurify"
import AddItemAlert from "@/components/ui/add-item-alert"

// ── helpers ──────────────────────────────────────────────

function avatarColor(name) {
  const colors = ["#5b8dd9","#5a9e72","#b87a3d","#7b68c8","#4a9bb5","#c0694a","#9b6db5","#7a9e5a","#c45a7a"]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function initials(from) {
  const name = from.replace(/<.*>/, "").trim()
  const parts = name.split(" ").filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function senderName(from) {
  const match = from.match(/^([^<]+)</)
  if (match) return match[1].trim()
  return from.replace(/<.*>/, "").trim() || from
}

function senderEmail(from) {
  const match = from.match(/<(.+)>/)
  return match ? match[1] : from.trim()
}

function formatDate(dateStr) {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  const day = 86400000
  if (diff < day && date.getDate() === now.getDate())
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (diff < 2 * day) return "Yesterday"
  if (diff < 7 * day) return date.toLocaleDateString([], { weekday: "short" })
  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

function sanitizeHtml(html) {
  if (typeof window === "undefined") return ""
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "style","p","br","b","strong","i","em","u","s","a","ul","ol","li",
      "blockquote","pre","code","h1","h2","h3","h4","h5","h6",
      "table","thead","tbody","tr","th","td","img","div","span","hr"
    ],
    ALLOWED_ATTR: ["href","src","alt","title","style","class","target","rel","width","height","colspan","rowspan"],
    FORBID_SCRIPTS: true,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ALLOW_DATA_ATTR: false,
  })
}

// ── Module-level email cache ──────────────────────────────
let emailCache = []
let cacheLoaded = false

// ── SVG icon helper ───────────────────────────────────────
function Ic({ children, size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

// ── MAIN ─────────────────────────────────────────────────
export default function Home() {
  const { data: session } = useSession()

  const [emails, setEmails]         = useState(emailCache)
  const [loading, setLoading]       = useState(false)
  const [fetchError, setFetchError] = useState("")
  const [selected, setSelected]     = useState(null)
  const [theme, setTheme]           = useState("light")
  const [collapsed, setCollapsed]   = useState(false)
  const [railTab, setRailTab]       = useState("inbox")
  const [inboxFilter, setInboxFilter] = useState("all")
  const [folders, setFolders]       = useState([])
  const [emailTags, setEmailTags]   = useState({})
  const [customTags, setCustomTags] = useState([])
  const [expandedSections, setExpandedSections] = useState({ filters: true, folders: true, tags: true })
  const [archived, setArchived]     = useState(new Set())
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [settingsOpen, setSettings] = useState(false)
  const [search, setSearch]         = useState("")
  const [composeTo, setComposeTo]   = useState("")
  const [isComposing, setComposing] = useState(false)
  const [visibleCount, setVisibleCount] = useState(24)
  const [showTop, setShowTop]       = useState(false)
  const [showMore, setShowMore]     = useState(false)
  const threadScrollRef             = useRef(null)
  const [read, setRead]             = useState(new Set())
  const [starred, setStarred]       = useState(new Set())
  const [readLater, setReadLater]   = useState(new Set())
  const [addAlertOpen, setAddAlertOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    title: "",
    items: [],
  })
  const [addAlertConfig, setAddAlertConfig] = useState({
    title: "",
    description: "",
    label: "",
    placeholder: "",
    confirmText: "Add",
    suggestions: [],
    onConfirm: () => {},
  })

  // load persisted state
  useEffect(() => {
    setTheme(localStorage.getItem("fm-theme") || "light")
    setCollapsed(localStorage.getItem("fm-collapsed") === "true")
    setRead(new Set(JSON.parse(localStorage.getItem("fm-read") || "[]")))
    setStarred(new Set(JSON.parse(localStorage.getItem("fm-starred") || "[]")))
    setReadLater(new Set(JSON.parse(localStorage.getItem("fm-readlater") || "[]")))
    setArchived(new Set(JSON.parse(localStorage.getItem("fm-archived") || "[]")))
    setFolders(JSON.parse(localStorage.getItem("fm-folders") || "[]"))
    setEmailTags(JSON.parse(localStorage.getItem("fm-email-tags") || "{}"))
    setCustomTags(JSON.parse(localStorage.getItem("fm-custom-tags") || "[]"))
    setExpandedSections(JSON.parse(localStorage.getItem("fm-expanded") || '{"filters":true,"folders":true,"tags":true}'))
  }, [])

  const fetchEmails = useCallback(() => {
    setLoading(true)
    setFetchError("")
    setEmails([])
    fetch("/api/emails?limit=20")
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || "Failed")
        const first = (data.emails || []).sort((a, b) => new Date(b.date) - new Date(a.date))
        emailCache = first; cacheLoaded = true
        setEmails(first)
        setLoading(false)
        if (!data.nextPageToken) return null
        return fetch(`/api/emails?limit=100&pageToken=${encodeURIComponent(data.nextPageToken)}`)
      })
      .then(async r => {
        if (!r) return
        const data = await r.json()
        if (data.emails?.length) {
          setEmails(prev => {
            const ids = new Set(prev.map(e => e.id))
            const combined = [...prev, ...data.emails.filter(e => !ids.has(e.id))]
              .sort((a, b) => new Date(b.date) - new Date(a.date))
            emailCache = combined; cacheLoaded = true
            return combined
          })
        }
      })
      .catch(err => { setFetchError(err.message); setLoading(false) })
  }, [])

  useEffect(() => { if (session && !cacheLoaded) fetchEmails() }, [session, fetchEmails])

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem("fm-theme", theme)
  }, [theme])

  useEffect(() => { localStorage.setItem("fm-collapsed", collapsed) }, [collapsed])
  useEffect(() => { localStorage.setItem("fm-read", JSON.stringify([...read])) }, [read])
  useEffect(() => { localStorage.setItem("fm-starred", JSON.stringify([...starred])) }, [starred])
  useEffect(() => { localStorage.setItem("fm-readlater", JSON.stringify([...readLater])) }, [readLater])
  useEffect(() => { localStorage.setItem("fm-archived", JSON.stringify([...archived])) }, [archived])
  useEffect(() => { localStorage.setItem("fm-folders", JSON.stringify(folders)) }, [folders])
  useEffect(() => { localStorage.setItem("fm-email-tags", JSON.stringify(emailTags)) }, [emailTags])
  useEffect(() => { localStorage.setItem("fm-custom-tags", JSON.stringify(customTags)) }, [customTags])
  useEffect(() => { localStorage.setItem("fm-expanded", JSON.stringify(expandedSections)) }, [expandedSections])

  function toggleSection(key) {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const openEmail = useCallback(email => {
    setSelected(email)
    setComposing(false)
    setRead(prev => new Set([...prev, email.id]))
  }, [])

  function archiveEmail(id) {
    setArchived(prev => new Set([...prev, id]))
    if (selected?.id === id) setSelected(null)
    setComposing(false)
  }

  function toggleStar(id) {
    setStarred(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleReadLater(id) {
    setReadLater(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleTag(id, tag) {
    setEmailTags(prev => {
      const cur = new Set(prev[id] || [])
      cur.has(tag) ? cur.delete(tag) : cur.add(tag)
      return { ...prev, [id]: [...cur] }
    })
  }

  function openAddAlert(config) {
    setAddAlertConfig({
      title: config.title || "Add item",
      description: config.description || "",
      label: config.label || "Name",
      placeholder: config.placeholder || "Type a value",
      confirmText: config.confirmText || "Add",
      suggestions: config.suggestions || [],
      onConfirm: config.onConfirm || (() => {}),
    })
    setAddAlertOpen(true)
  }

  function openContextMenu(event, config) {
    event.preventDefault()
    event.stopPropagation()
    const maxX = Math.max(8, window.innerWidth - 240)
    const maxY = Math.max(8, window.innerHeight - 220)
    setContextMenu({
      open: true,
      x: Math.min(event.clientX, maxX),
      y: Math.min(event.clientY, maxY),
      title: config.title || "Actions",
      items: config.items || [],
    })
  }

  function closeContextMenu() {
    setContextMenu(prev => ({ ...prev, open: false }))
  }

  function openCreateTagAlert() {
    openAddAlert({
      title: "Add tag",
      description: "Create a tag you can reuse anywhere in your inbox.",
      label: "Tag name",
      placeholder: "example: follow-up",
      confirmText: "Add tag",
      suggestions: ["important", "not-important", "follow-up", "client", "invoice"],
      onConfirm: (value) => {
        const nextTag = value.trim().toLowerCase()
        if (!nextTag) return
        setCustomTags(prev => [...new Set([...prev, nextTag])])
      },
    })
  }

  function openCreateFolderAlert() {
    openAddAlert({
      title: "Add folder",
      description: "Create a custom folder to group senders.",
      label: "Folder name",
      placeholder: "example: Clients",
      confirmText: "Add folder",
      suggestions: ["Clients", "Team", "Vendors", "Personal"],
      onConfirm: (value) => {
        const name = value.trim()
        if (!name) return
        const id = `${Date.now()}`
        setFolders(prev => [...prev, { id, name, members: [] }])
        setRailTab("inbox")
        setInboxFilter(`folder:${id}`)
        if (!expandedSections.folders) {
          setExpandedSections(prev => ({ ...prev, folders: true }))
        }
      },
    })
  }

  function openAddFolderMemberAlert(folder) {
    openAddAlert({
      title: `Add sender to ${folder.name}`,
      description: "Enter the sender email you want this folder to include.",
      label: "Sender email",
      placeholder: "name@example.com",
      confirmText: "Add sender",
      suggestions: senderSuggestions.map(item => item.email),
      onConfirm: (value) => {
        const email = value.trim().toLowerCase()
        if (!email) return
        setFolders(prev => prev.map(item => item.id === folder.id
          ? { ...item, members: [...new Set([...(item.members || []), email])] }
          : item
        ))
      },
    })
  }

  useEffect(() => {
    if (!contextMenu.open) return
    function onKeyDown(event) {
      if (event.key === "Escape") closeContextMenu()
    }
    window.addEventListener("resize", closeContextMenu)
    window.addEventListener("scroll", closeContextMenu, true)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("resize", closeContextMenu)
      window.removeEventListener("scroll", closeContextMenu, true)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [contextMenu.open])

  function domainOf(e) {
    const em = senderEmail(e.from || "")
    return em.includes("@") ? em.split("@")[1].toLowerCase() : ""
  }

  const isNewDomain = useCallback(e => {
    const domain = domainOf(e)
    if (!domain) return false
    return emails.filter(x => !archived.has(x.id) && domainOf(x) === domain).length === 1
  }, [emails, archived])

  const people = [...new Map(emails.map(e => [senderEmail(e.from), e])).values()]
    .map(e => ({ name: senderName(e.from), email: senderEmail(e.from), from: e.from }))

  const senderSuggestions = useMemo(() => {
    const map = new Map()
    for (const email of emails) {
      const address = senderEmail(email.from || "").toLowerCase().trim()
      if (!address) continue
      const name = senderName(email.from || "").trim()
      const ts = new Date(email.date || "").getTime() || 0
      const existing = map.get(address)
      if (!existing) {
        map.set(address, {
          email: address,
          name,
          count: 1,
          lastTs: ts,
        })
      } else {
        existing.count += 1
        if (ts > existing.lastTs) existing.lastTs = ts
        if (!existing.name && name) existing.name = name
      }
    }
    return [...map.values()].sort((a, b) => a.email.localeCompare(b.email))
  }, [emails])

  const displayEmails = useMemo(() => {
    let list = emails.filter(e => !archived.has(e.id))
    if (railTab === "starred") list = list.filter(e => starred.has(e.id))
    if (railTab === "later")   list = list.filter(e => readLater.has(e.id))
    if (railTab === "people" && selectedPerson)
      list = list.filter(e => senderEmail(e.from) === selectedPerson.email)

    if (railTab === "inbox") {
      if (inboxFilter === "receipts")   list = list.filter(e => /receipt|invoice|order|payment|bill|paid/i.test(`${e.subject} ${e.snippet}`))
      if (inboxFilter === "updates")    list = list.filter(e => /update|newsletter|digest|announcement|weekly|news/i.test(`${e.subject} ${e.snippet}`))
      if (inboxFilter === "personal")   list = list.filter(e => !/receipt|invoice|order|payment|bill|paid|update|newsletter|digest|announcement|weekly|news/i.test(`${e.subject} ${e.snippet}`))
      if (inboxFilter === "new-domain") list = list.filter(isNewDomain)
      if (inboxFilter === "archived")   list = emails.filter(e => archived.has(e.id))
      if (inboxFilter.startsWith("folder:")) {
        const folder = folders.find(f => f.id === inboxFilter.replace("folder:", ""))
        const members = new Set((folder?.members || []).map(v => v.toLowerCase()))
        list = list.filter(e => members.has(senderEmail(e.from).toLowerCase()))
      }
      if (inboxFilter.startsWith("tag:")) {
        const tag = inboxFilter.replace("tag:", "")
        list = tag === "later"
          ? list.filter(e => readLater.has(e.id))
          : list.filter(e => (emailTags[e.id] || []).includes(tag))
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e => senderName(e.from).toLowerCase().includes(q) || e.subject.toLowerCase().includes(q))
    }
    return list
  }, [emails, archived, starred, readLater, railTab, inboxFilter, selectedPerson, search, folders, emailTags, isNewDomain])

  const unread       = emails.filter(e => e.unread && !read.has(e.id)).length
  const peopleEmails = railTab === "people" && selectedPerson ? displayEmails : []

  const displayVisible = displayEmails.slice(0, visibleCount)
  const hasMore        = railTab === "people" ? peopleEmails.length > visibleCount : displayEmails.length > visibleCount

  useEffect(() => {
    if (railTab === "people" && selectedPerson) {
      const pe = emails.filter(e => senderEmail(e.from) === selectedPerson.email)
      if (pe.length > 0) openEmail(pe[0])
    }
  }, [selectedPerson, railTab, emails, openEmail])

  useEffect(() => {
    setVisibleCount(24); setShowTop(false); setShowMore(false)
    if (threadScrollRef.current) threadScrollRef.current.scrollTop = 0
  }, [railTab, inboxFilter, search, selectedPerson?.email])

  function onThreadScroll(e) {
    const el = e.currentTarget
    const remaining = el.scrollHeight - el.clientHeight - el.scrollTop
    setShowTop(el.scrollTop > 8)
    setShowMore(hasMore && remaining <= 180)
  }

  if (!session) {
    return (
      <div className="signin-page">
        <div className="signin-logo">fe-Mail</div>
        <p className="signin-sub">A calmer inbox, just for you.</p>
        <button className="signin-btn" onClick={() => signIn("google", { callbackUrl: "/" })}>
          Sign in with Google
        </button>
        <p className="signin-legal">
          By continuing, you agree to our <a className="signin-link" href="/terms">Terms & Conditions</a> and <a className="signin-link" href="/privacy">Privacy Policy</a>.
        </p>
      </div>
    )
  }

  // nav item helper
  function NavItem({ icon, label, active, onClick, dot, children }) {
    return (
      <button className={`fm-nav-item ${active ? "active" : ""}`} onClick={onClick}>
        {icon}
        <span className="lbl">{label}</span>
        {dot && <span className="fm-dot" />}
        {children}
      </button>
    )
  }

  return (
    <>
      <div className={`app ${collapsed ? "collapsed" : ""}`}>

        {/* ── SIDEBAR ── */}
        <aside className="fm-sidebar">

          {/* Header */}
          <div className="fm-sidebar-header">
            <span className="fm-logo">fe-Mail</span>
            <button className="fm-collapse-btn" onClick={() => setCollapsed(v => !v)} title={collapsed ? "Expand" : "Collapse"}>
              <Ic size={13}>
                {collapsed ? <path d="M9 6l6 6-6 6"/> : <path d="M15 18l-6-6 6-6"/>}
              </Ic>
            </button>
          </div>

          {/* Body */}
          <div className="fm-sidebar-body">

            {/* Main nav */}
            <NavItem icon={<Ic><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></Ic>}
              label="Compose" active={isComposing}
              onClick={() => { setComposing(true); setComposeTo(""); setSelected(null) }} />

            <NavItem icon={<Ic><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></Ic>}
              label="Inbox" active={railTab === "inbox" && inboxFilter === "all" && !isComposing} dot={unread > 0}
              onClick={() => { setRailTab("inbox"); setInboxFilter("all"); setComposing(false); setSelectedPerson(null) }} />

            <NavItem icon={<Ic><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></Ic>}
              label="Starred" active={railTab === "starred" && !isComposing}
              onClick={() => { setRailTab("starred"); setComposing(false); setSelectedPerson(null) }} />

            <NavItem icon={<Ic><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Ic>}
              label="Read later" active={railTab === "later" && !isComposing}
              onClick={() => { setRailTab("later"); setComposing(false); setSelectedPerson(null) }} />

            <NavItem icon={<Ic><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></Ic>}
              label="Archived" active={railTab === "inbox" && inboxFilter === "archived" && !isComposing}
              onClick={() => { setRailTab("inbox"); setInboxFilter("archived"); setComposing(false); setSelectedPerson(null) }} />

            <NavItem icon={<Ic><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Ic>}
              label="People" active={railTab === "people" && !isComposing}
              onClick={() => { setRailTab("people"); setSelectedPerson(null); setComposing(false) }} />

            <div className="fm-divider" />

            {/* People list */}
            {railTab === "people" && (
              <>
                {people.length === 0
                  ? <p className="fm-empty-hint">No senders yet</p>
                  : people
                    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase()))
                    .map(person => (
                      <button key={person.email}
                        className={`fm-nav-item ${selectedPerson?.email === person.email ? "active" : ""}`}
                        onClick={() => setSelectedPerson(person)}>
                        <div className="person-av" style={{ background: avatarColor(person.name) }}>
                          {initials(person.from)}
                        </div>
                        <span className="lbl">{person.name}</span>
                      </button>
                    ))
                }
              </>
            )}

            {/* Inbox views + filters */}
            {!collapsed && (railTab === "inbox" || railTab === "starred" || railTab === "later") && (
              <>
                <div className="fm-section-label" style={{ marginTop: "4px", cursor: "pointer", userSelect: "none" }} onClick={() => toggleSection("filters")}>
                  Smart filters
                  <Ic><polyline points={expandedSections.filters ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/></Ic>
                </div>

                {expandedSections.filters && (
                  <>
                    <NavItem icon={<Ic><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></Ic>}
                      label="New senders" active={inboxFilter === "new-domain"}
                      onClick={() => { setRailTab("inbox"); setInboxFilter("new-domain"); setComposing(false) }} />

                    <NavItem icon={<Ic><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></Ic>}
                      label="Receipts" active={inboxFilter === "receipts"}
                      onClick={() => { setRailTab("inbox"); setInboxFilter("receipts"); setComposing(false) }} />

                    <NavItem icon={<Ic><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></Ic>}
                      label="Updates" active={inboxFilter === "updates"}
                      onClick={() => { setRailTab("inbox"); setInboxFilter("updates"); setComposing(false) }} />

                    <NavItem icon={<Ic><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></Ic>}
                      label="Personal" active={inboxFilter === "personal"}
                      onClick={() => { setRailTab("inbox"); setInboxFilter("personal"); setComposing(false) }} />
                  </>
                )}

                <div className="fm-divider" />

                {/* Folders */}
                <div className="fm-section-label" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSection("folders")} onContextMenu={event => {
                  openContextMenu(event, {
                    title: "Folders",
                    items: [
                      {
                        label: "Create folder",
                        action: () => openCreateFolderAlert(),
                      },
                    ],
                  })
                }}>
                  Folders
                  <Ic><polyline points={expandedSections.folders ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/></Ic>
                </div>

                {expandedSections.folders && (
                  <>
                    {folders.length === 0 && <p className="fm-empty-hint">No folders yet</p>}

                    {folders.map(folder => (
                      <button key={folder.id}
                        className={`fm-nav-item ${inboxFilter === `folder:${folder.id}` ? "active" : ""}`}
                        onContextMenu={event => {
                          openContextMenu(event, {
                            title: folder.name,
                            items: [
                              {
                                label: "Add sender",
                                action: () => openAddFolderMemberAlert(folder),
                              },
                              {
                                label: "Delete folder",
                                danger: true,
                                action: () => {
                                  setFolders(prev => prev.filter(f => f.id !== folder.id))
                                  if (inboxFilter === `folder:${folder.id}`) setInboxFilter("all")
                                },
                              },
                            ],
                          })
                        }}
                        onClick={() => { setRailTab("inbox"); setInboxFilter(`folder:${folder.id}`); setComposing(false) }}>
                        <Ic><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></Ic>
                        <span className="lbl">{folder.name}</span>
                        <button className="fm-item-btn" onClick={e => {
                          e.stopPropagation()
                          openAddFolderMemberAlert(folder)
                        }}>+</button>
                      </button>
                    ))}
                  </>
                )}

                {/* Tags */}
                <div className="fm-section-label" style={{ marginTop: "6px", cursor: "pointer", userSelect: "none" }} onClick={() => toggleSection("tags")} onContextMenu={event => {
                  openContextMenu(event, {
                    title: "Tags",
                    items: [
                      {
                        label: "Create tag",
                        action: () => {
                          openCreateTagAlert()
                          if (!expandedSections.tags) {
                            setExpandedSections(prev => ({ ...prev, tags: true }))
                          }
                        },
                      },
                    ],
                  })
                }}>
                  Tags
                  <Ic><polyline points={expandedSections.tags ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/></Ic>
                </div>

                {expandedSections.tags && (
                  <>
                    {["important", "not-important", ...customTags].map(tag => (
                      <button key={tag}
                        className={`fm-nav-item ${inboxFilter === `tag:${tag}` ? "active" : ""}`}
                        onContextMenu={event => {
                          if (["important", "not-important"].includes(tag)) {
                            openContextMenu(event, {
                              title: tag,
                              items: [
                                {
                                  label: "Protected tag",
                                  disabled: true,
                                  action: () => {},
                                },
                              ],
                            })
                            return
                          }
                          openContextMenu(event, {
                            title: tag,
                            items: [
                              {
                                label: "Delete tag",
                                danger: true,
                                action: () => {
                                  setCustomTags(prev => prev.filter(t => t !== tag))
                                  if (inboxFilter === `tag:${tag}`) setInboxFilter("all")
                                },
                              },
                            ],
                          })
                        }}
                        onClick={() => { setRailTab("inbox"); setInboxFilter(`tag:${tag}`); setComposing(false) }}>
                        <div className="tag-dot" style={{ background: avatarColor(tag) }} />
                        <span className="lbl">{tag}</span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="fm-sidebar-footer">
            <button className="fm-nav-item" onClick={() => setSettings(true)}>
              <Ic><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Ic>
              <span className="lbl">Settings</span>
            </button>
          </div>
        </aside>

        {/* ── THREAD COLUMN ── */}
        <div className="thread-col">
          <div className="thread-head">
            <h3>
              {railTab === "people" && selectedPerson
                ? selectedPerson.name
                : { inbox: "Inbox", starred: "Starred", later: "Read later", people: "People" }[railTab]}
            </h3>
            <div className="thread-head-actions">
              <button className="sm-btn" onClick={fetchEmails} title="Refresh">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
            </div>
          </div>

          {railTab === "inbox" && (
            <div className="thread-search-row">
              <div className="fm-search">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input placeholder="Search inbox…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
          )}

          <div className="thread-scroll" ref={threadScrollRef} onScroll={onThreadScroll}>

            {railTab === "people" && !selectedPerson && (
              <p style={{ padding: "32px 16px", textAlign: "center", fontSize: "13px", color: "var(--text3)", fontStyle: "italic" }}>
                Select a person from the sidebar
              </p>
            )}

            {railTab === "people" && selectedPerson && (
              peopleEmails.slice(0, visibleCount).map(e => (
                <ThreadRow key={e.id} email={e}
                  unread={e.unread && !read.has(e.id)}
                  starred={starred.has(e.id)}
                  active={selected?.id === e.id}
                  onClick={() => openEmail(e)} />
              ))
            )}

            {railTab !== "people" && (
              <>
                {loading && <p style={{ padding: "20px 16px", fontSize: "13px", color: "var(--text3)" }}>Loading…</p>}
                {fetchError && <p style={{ padding: "16px", fontSize: "13px", color: "#c74848" }}>{fetchError}</p>}

                {displayVisible.map(e => (
                  <ThreadRow key={e.id} email={e} unread={e.unread && !read.has(e.id)} starred={starred.has(e.id)}
                    active={selected?.id === e.id} onClick={() => openEmail(e)} />
                ))}

                {!loading && displayEmails.length === 0 && (
                  <p style={{ padding: "32px 16px", textAlign: "center", fontSize: "13px", color: "var(--text3)" }}>
                    Nothing here
                  </p>
                )}
              </>
            )}

            {showMore && (
              <button className="thread-load-more" onClick={() => setVisibleCount(v => v + 24)}>
                load more
              </button>
            )}
          </div>

          {showTop && (
            <button className="thread-top-btn" onClick={() => threadScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </button>
          )}
        </div>

        {/* ── DETAIL ── */}
        <div className="detail">
          {isComposing ? (
            <ComposePane
              initialTo={composeTo}
              recipientSuggestions={senderSuggestions}
              onClose={() => { setComposing(false); setComposeTo("") }}
            />
          ) : selected ? (
            <EmailDetail
              key={selected.id}
              email={selected}
              starred={starred.has(selected.id)}
              readLater={readLater.has(selected.id)}
              tags={emailTags[selected.id] || []}
              customTags={customTags}
              onArchive={() => archiveEmail(selected.id)}
              onStar={() => toggleStar(selected.id)}
              onReadLater={() => toggleReadLater(selected.id)}
              onToggleTag={tag => toggleTag(selected.id, tag)}
              onComposeTo={to => { setComposeTo(to); setComposing(true) }}
            />
          ) : (
            <div className="empty-state">
              <div className="e-title">fe-Mail</div>
              <div className="e-sub">Select an email to read</div>
            </div>
          )}
        </div>

      </div>

      {settingsOpen && (
        <SettingsModal
          session={session}
          theme={theme}
          onThemeToggle={() => setTheme(t => t === "light" ? "dark" : "light")}
          onClose={() => setSettings(false)}
          onSignOut={() => { setSettings(false); signOut() }}
        />
      )}

      <AddItemAlert
        open={addAlertOpen}
        title={addAlertConfig.title}
        description={addAlertConfig.description}
        label={addAlertConfig.label}
        placeholder={addAlertConfig.placeholder}
        confirmText={addAlertConfig.confirmText}
        suggestions={addAlertConfig.suggestions}
        onClose={() => setAddAlertOpen(false)}
        onConfirm={addAlertConfig.onConfirm}
      />

      {contextMenu.open && (
        <>
          <div className="fm-context-menu-backdrop" onClick={closeContextMenu} />
          <div
            className="fm-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={event => event.stopPropagation()}
            onContextMenu={event => event.preventDefault()}>
            <div className="fm-context-menu-title">{contextMenu.title}</div>
            <div className="fm-context-menu-items">
              {contextMenu.items.map(item => (
                <button
                  key={item.label}
                  type="button"
                  className={`fm-context-menu-item ${item.danger ? "danger" : ""}`}
                  disabled={item.disabled}
                  onClick={() => {
                    closeContextMenu()
                    if (item.disabled) return
                    item.action?.()
                  }}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── Thread row ────────────────────────────────────────────
const ThreadRow = memo(function ThreadRow({ email, unread, active, starred, onClick }) {
  return (
    <div className={`t-row ${unread ? "unread" : ""} ${active ? "active" : ""}`} onClick={onClick}>
      <span className={`u-dot ${unread ? "" : "hidden"}`} />
      <div className="t-info">
        <div className={`t-name ${unread ? "" : "seen"}`}>{senderName(email.from)}</div>
        <div className="t-subject">{email.subject}</div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"4px", flexShrink:0 }}>
        <div className="t-time">{formatDate(email.date)}</div>
        {starred && (
          <svg viewBox="0 0 24 24" width="9" height="9" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        )}
      </div>
    </div>
  )
})

// ── Email detail ──────────────────────────────────────────
function EmailDetail({ email, starred, readLater, tags, customTags, onArchive, onStar, onReadLater, onToggleTag, onComposeTo }) {
  const name      = senderName(email.from)
  const fromEmail = senderEmail(email.from)
  const [reply, setReply]       = useState("")
  const [body, setBody]         = useState("")
  const [attachments, setAtts]  = useState([])
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [sendErr, setSendErr]   = useState("")

  useEffect(() => {
    setLoading(true)
    fetch(`/api/emails?id=${email.id}`)
      .then(r => r.json())
      .then(d => { setBody(d.body || ""); setAtts(d.attachments || []); setLoading(false) })
  }, [email.id])

  function renderBody(text) {
    if (!text) return ""
    if (text.trim().startsWith("<")) {
      const scoped = text.replace(/<style([\s\S]*?)>([\s\S]*?)<\/style>/gi, (_, attrs, css) => {
        const scopedCss = css
          .replace(/@media([^{]+)\{([\s\S]*?)\}\s*\}/gi, (_, q, inner) =>
            `@media${q}{${inner.replace(/([^{}]+)\{/g, (m, sel) =>
              sel.split(",").map(s => `.email-html-body ${s.trim()}`).join(",") + "{"
            )}}`
          )
          .replace(/([^@{}]+)\{(?![^}]*\{)/g, (m, sel) =>
            sel.split(",").map(s => `.email-html-body ${s.trim()}`).join(",") + "{"
          )
        return `<style${attrs}>${scopedCss}</style>`
      })
      const withCids = scoped.replace(/src=(['"])cid:([^'"\s>]+)\1/gi, (match, q, cid) => {
        const found = attachments.find(a => (a.contentId||"").replace(/[<>]/g,"").toLowerCase() === cid.replace(/[<>]/g,"").toLowerCase())
        return found?.id ? `src=${q}/api/attachments?emailId=${encodeURIComponent(email.id)}&attachmentId=${encodeURIComponent(found.id)}${q}` : match
      })
      return sanitizeHtml(withCids)
    }
    const esc = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    return esc.replace(/(https?:\/\/[^\s<]+)/gi,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
      .split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g,"<br/>")}</p>`).join("")
  }

  async function sendReply() {
    if (!reply.trim() || sending) return
    setSending(true); setSendErr("")
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: email.from, subject: email.subject, body: reply, threadId: email.threadId || email.id, messageId: email.id })
    })
    const data = await res.json()
    setSending(false)
    if (res.ok && data.success) { setSent(true); setReply(""); setTimeout(() => setSent(false), 3000) }
    else setSendErr(data.error || "Failed to send")
  }

  return (
    <>
      <div className="detail-bar">
        <button className="d-btn" title="Archive" onClick={onArchive}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
          </svg>
        </button>
        <button className="d-btn" title="Read later" onClick={onReadLater}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={readLater ? "var(--accent)" : "currentColor"} strokeWidth="1.65" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>

        <div className="detail-bar-contact">
          <div className="detail-bar-contact-name">{name}</div>
          <div className="detail-bar-contact-email-wrap">
            <div className="detail-bar-contact-email">{fromEmail}</div>
            <button className="detail-bar-contact-compose" onClick={() => onComposeTo(fromEmail)}>
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>

        <button className="d-btn" title="Star" onClick={onStar}>
          <svg viewBox="0 0 24 24" width="14" height="14" strokeWidth="1.65" strokeLinecap="round"
            fill={starred ? "var(--accent)" : "none"} stroke={starred ? "var(--accent)" : "currentColor"}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
        <button className="d-btn" title="Reply" onClick={() => onComposeTo(email.from)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
          </svg>
        </button>
      </div>

      <div className="detail-tagbar">
        {["important","not-important",...customTags].map(tag => (
          <button key={tag} className={`detail-tagchip ${tags.includes(tag) ? "active" : ""}`} onClick={() => onToggleTag(tag)}>{tag}</button>
        ))}
        <button className={`detail-tagchip ${readLater ? "active" : ""}`} onClick={onReadLater}>later</button>
      </div>

      <div className="email-scroll">
        <div className="e-subject">{email.subject}</div>
        <div className="e-body">
          {loading
            ? <p style={{ color: "var(--text3)", fontStyle: "italic" }}>Loading…</p>
            : <>
                <div className="email-html-body" dangerouslySetInnerHTML={{ __html: renderBody(body) }} />
                {attachments.length > 0 && (
                  <div style={{ marginTop: "24px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {attachments.map(att => (
                      <a key={att.id}
                        href={`/api/attachments?emailId=${encodeURIComponent(email.id)}&attachmentId=${encodeURIComponent(att.id)}`}
                        download={att.filename || "attachment"}
                        className="att-chip">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                        </svg>
                        {att.filename || "attachment"}
                        <span className="att-size">{Math.max(1, Math.round((att.size||0)/1024))} KB</span>
                      </a>
                    ))}
                  </div>
                )}
              </>
          }
        </div>
      </div>

      <div className="reply-area">
        <div className="reply-label">Reply to {name}</div>
        <div className="reply-box">
          <textarea className="reply-input" rows={2}
            placeholder={`Write a reply to ${name}…`}
            value={reply}
            onChange={e => { setReply(e.target.value); if (sendErr) setSendErr("") }}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply() }}
          />
          <div className="reply-footer">
            <span style={{ fontSize: "11px", color: "var(--text3)" }}>⌘↵ to send</span>
            {sendErr && <span style={{ fontSize: "11px", color: "#c74848" }}>{sendErr}</span>}
            <div className="spacer" />
            <button className="send-btn" onClick={sendReply} disabled={sending || !reply.trim()}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              {sending ? "Sending…" : sent ? "Sent ✓" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Compose pane ──────────────────────────────────────────
function ComposePane({ initialTo, recipientSuggestions = [], onClose }) {
  const [to, setTo]         = useState(initialTo || "")
  const [subject, setSubject] = useState("")
  const [body, setBody]     = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent]     = useState(false)
  const [err, setErr]       = useState("")
  const [toFocus, setToFocus] = useState(false)
  const [activeToSuggestion, setActiveToSuggestion] = useState(-1)
  const toRef               = useRef(null)
  const suggestionRefs      = useRef([])

  useEffect(() => { if (!initialTo) toRef.current?.focus() }, [initialTo])

  async function send() {
    if (!to.trim() || !body.trim() || sending) return
    setSending(true); setErr("")
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject: subject || "(no subject)", body })
    })
    const data = await res.json()
    setSending(false)
    if (res.ok && data.success) { setSent(true); setTimeout(() => { setSent(false); onClose() }, 1500) }
    else setErr(data.error || "Failed to send")
  }

  const filteredToSuggestions = useMemo(() => {
    const q = to.trim().toLowerCase()
    if (!q) return []

    const now = Date.now()
    return recipientSuggestions
      .map(item => {
        const email = item.email || ""
        const name = (item.name || "").toLowerCase()
        const local = email.split("@")[0] || ""
        const domain = email.split("@")[1] || ""

        let score = -1
        if (email === q) score = -1
        else if (email.startsWith(q)) score = 140
        else if (local.startsWith(q)) score = 125
        else if (name && name.startsWith(q)) score = 120
        else if (email.includes(q)) score = 100
        else if (name && name.includes(q)) score = 90
        else if (domain.startsWith(q)) score = 80

        if (score < 0) return null

        const activityBoost = Math.min(item.count || 1, 20)
        const ageDays = Math.max(0, Math.floor((now - (item.lastTs || 0)) / 86400000))
        const recencyBoost = item.lastTs ? Math.max(0, 14 - Math.min(ageDays, 14)) : 0

        return {
          ...item,
          score: score + activityBoost + recencyBoost,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.email.localeCompare(b.email))
      .slice(0, 8)
  }, [recipientSuggestions, to])

  const showToSuggestions = toFocus && filteredToSuggestions.length > 0

  useEffect(() => {
    setActiveToSuggestion(-1)
  }, [to, filteredToSuggestions.length])

  useEffect(() => {
    if (!showToSuggestions) return
    if (activeToSuggestion < 0) return
    const target = suggestionRefs.current[activeToSuggestion]
    target?.focus()
  }, [activeToSuggestion, showToSuggestions])

  function handleToKeyDown(event) {
    const total = filteredToSuggestions.length

    if (event.key === "Tab") {
      if (total === 0) return
      event.preventDefault()
      event.stopPropagation()
      setToFocus(true)

      setActiveToSuggestion(prev => {
        const next = prev < 0
          ? (event.shiftKey ? total - 1 : 0)
          : (event.shiftKey ? (prev - 1 + total) % total : (prev + 1) % total)
        return next
      })
      return
    }

    if (event.key === "ArrowDown") {
      if (total === 0) return
      event.preventDefault()
      setActiveToSuggestion(prev => {
        const next = prev < 0 ? 0 : (prev + 1) % total
        return next
      })
      return
    }

    if (event.key === "ArrowUp") {
      if (total === 0) return
      event.preventDefault()
      setActiveToSuggestion(prev => {
        const next = prev < 0 ? total - 1 : (prev - 1 + total) % total
        return next
      })
      return
    }

    if (event.key === "Enter" && activeToSuggestion >= 0) {
      event.preventDefault()
      const picked = filteredToSuggestions[activeToSuggestion]
      if (picked) setTo(picked.email)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="detail-bar">
        <button className="d-btn" onClick={onClose} title="Discard">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div className="detail-bar-subject">New message</div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "28px 36px 0", overflowY: "auto" }}>
        <div className="compose-field">
          <span className="compose-field-label">To</span>
          <div className="compose-to-wrap">
            <input
              ref={toRef}
              className="compose-field-input"
              placeholder="recipient@example.com"
              value={to}
              onFocus={() => setToFocus(true)}
              onBlur={event => {
                const next = event.relatedTarget
                if (next && next.closest?.(".compose-to-wrap")) return
                setTimeout(() => setToFocus(false), 120)
              }}
              onKeyDown={handleToKeyDown}
              onChange={e => { setTo(e.target.value); if (err) setErr("") }}
            />
            {showToSuggestions && (
              <div className="compose-suggest-list">
                {filteredToSuggestions.map((item, index) => (
                  <button
                    key={item.email}
                    type="button"
                    tabIndex={-1}
                    ref={el => {
                      suggestionRefs.current[index] = el
                    }}
                    className={`compose-suggest-item ${index === activeToSuggestion ? "active" : ""}`}
                    onMouseDown={event => event.preventDefault()}
                    onFocus={() => {
                      setToFocus(true)
                      setActiveToSuggestion(index)
                    }}
                    onBlur={event => {
                      const next = event.relatedTarget
                      if (next && next.closest?.(".compose-to-wrap")) return
                      setTimeout(() => setToFocus(false), 120)
                    }}
                    onKeyDown={handleToKeyDown}
                    onMouseEnter={() => setActiveToSuggestion(index)}
                    onClick={() => setTo(item.email)}>
                    <span className="compose-suggest-line">
                      {item.name ? `${item.name} <${item.email}>` : item.email}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="compose-field">
          <span className="compose-field-label">Subject</span>
          <input className="compose-field-input" placeholder="What's this about?"
            value={subject} onChange={e => { setSubject(e.target.value); if (err) setErr("") }} />
        </div>
        <textarea className="compose-body" placeholder="Write your message…"
          value={body}
          onChange={e => { setBody(e.target.value); if (err) setErr("") }}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send() }} />
      </div>
      <div className="reply-area">
        <div className="reply-footer" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
          <span style={{ fontSize: "11px", color: "var(--text3)" }}>⌘↵ to send</span>
          {err && <span style={{ fontSize: "11px", color: "#c74848" }}>{err}</span>}
          <div className="spacer" />
          <button className="send-btn" onClick={send} disabled={sending || !to.trim() || !body.trim()}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            {sending ? "Sending…" : sent ? "Sent ✓" : "Send"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Settings modal ────────────────────────────────────────
function SettingsModal({ session, theme, onThemeToggle, onClose, onSignOut }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-profile">
          <div className="modal-avatar" style={{ background: avatarColor(session.user.name || session.user.email) }}>
            {initials(session.user.name || session.user.email)}
          </div>
          <div>
            <div className="modal-name">{session.user.name || "You"}</div>
            <div className="modal-email">{session.user.email}</div>
          </div>
        </div>

        <div className="modal-divider" />

        <div className="modal-row" onClick={onThemeToggle}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text2)" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <span className="modal-row-label">Theme</span>
          <span className="modal-row-value">{theme === "light" ? "Light" : "Dark"}</span>
          <div className="theme-toggle">
            <div className="theme-toggle-thumb" style={{ left: theme === "dark" ? "14px" : "2px" }} />
          </div>
        </div>

        <div className="modal-row" style={{ opacity: 0.4, cursor: "default" }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text2)" strokeWidth="1.7" strokeLinecap="round">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
            <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
          </svg>
          <span className="modal-row-label">Notifications</span>
          <span className="modal-row-value">Coming soon</span>
        </div>

        <div className="modal-divider" />

        <div className="modal-legal">
          <a className="modal-legal-link" href="/terms" target="_blank" rel="noopener noreferrer">Terms & Conditions</a>
          <span className="modal-legal-dot">•</span>
          <a className="modal-legal-link" href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        </div>

        <div className="modal-divider" />

        <div className="modal-row modal-signout" onClick={onSignOut}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span className="modal-row-label">Sign out</span>
        </div>

        <button className="modal-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  )
}