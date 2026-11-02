"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { fetchTitleMatches, type TitleMatch } from "@/lib/api"
import { searchHref, useSearchSettings, type SearchKind } from "@/lib/search"
import { useWorkspace } from "@/app/map/workspace/WorkspaceProvider"
import SearchSettings from "./SearchSettings"

// The bar in the ModeBar of the Map and of the results page: the query (a combobox: the input
// opens in a popover so the ModeBar's overflow never clips the list), the Search and Ask buttons
// and the settings. The open list leads with the same two actions, then papers by title or
// author - picking one opens it in the PDF panel. Enter runs the highlighted item (Search first);
// Ctrl+Enter always runs Ask. `busy` is the run the results page is waiting on.
export default function SearchBar({ initialQuery = "", busy = null }: { initialQuery?: string; busy?: SearchKind | null }) {
  const router = useRouter()
  const { openPdf } = useWorkspace()
  const [settings, setSettings] = useSearchSettings()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState(initialQuery)
  const [matches, setMatches] = useState<TitleMatch[]>([])
  const [selected, setSelected] = useState("")
  const seq = useRef(0)

  useEffect(() => {
    setQ(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    const text = q.trim()
    const n = ++seq.current
    const timer = setTimeout(() => {
      if (!text) {
        setMatches([])
        return
      }
      fetchTitleMatches(text)
        .then((r) => n === seq.current && setMatches(r.papers))
        .catch(() => n === seq.current && setMatches([]))
    }, 150)
    return () => clearTimeout(timer)
  }, [q])

  const text = q.trim()

  const run = (as: SearchKind) => {
    if (!text) return
    setOpen(false)
    router.push(searchHref(text, as, settings))
  }

  const pick = (m: TitleMatch) => {
    setOpen(false)
    openPdf({ sourceId: m.itemKey, title: m.title, page: 1 })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      run("ask")
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="outline" size="sm" className="w-72 justify-start font-normal" />}>
          <Search className="text-muted-foreground" />
          <span className={`truncate ${q ? "" : "text-muted-foreground"}`}>{q || "Search or ask your papers"}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 p-0">
          <Command shouldFilter={false} value={selected} onValueChange={setSelected} onKeyDown={onKeyDown}>
            <CommandInput autoFocus value={q} onValueChange={setQ} placeholder="Search or ask your papers" />
            {text ? (
              <CommandList>
                <CommandGroup>
                  <CommandItem value="run:search" onSelect={() => run("search")}>
                    <Search />
                    <span className="truncate">Search passages for &quot;{text}&quot;</span>
                    <CommandShortcut>Enter</CommandShortcut>
                  </CommandItem>
                  <CommandItem value="run:ask" onSelect={() => run("ask")}>
                    <Sparkles />
                    <span className="truncate">Ask &quot;{text}&quot;</span>
                    <CommandShortcut>Ctrl+Enter</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
                {matches.length > 0 ? (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Papers">
                      {matches.map((m) => (
                        <CommandItem key={m.itemKey} value={m.itemKey} onSelect={() => pick(m)}>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate">{m.title}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {[m.authors?.split("; ")[0], m.year].filter(Boolean).join(", ")}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                ) : null}
              </CommandList>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>

      <Button size="sm" disabled={!text || busy !== null} onClick={() => run("search")}>
        {busy === "search" ? <Spinner /> : <Search />}
        Search
      </Button>
      <Button variant="secondary" size="sm" disabled={!text || busy !== null} onClick={() => run("ask")}>
        {busy === "ask" ? <Spinner /> : <Sparkles />}
        Ask
      </Button>

      <SearchSettings value={settings} onChange={setSettings} />
    </div>
  )
}
