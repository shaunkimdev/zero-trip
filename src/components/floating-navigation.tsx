import { useEffect, useState } from "react"
import { Bookmark, Home, Route, SlidersHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"

type SectionId = "top" | "planner" | "result"

interface FloatingNavigationProps {
  hasPlan: boolean
  savedCount: number
  onSavedClick: () => void
}

export function FloatingNavigation({
  hasPlan,
  savedCount,
  onSavedClick,
}: FloatingNavigationProps) {
  const [activeSection, setActiveSection] = useState<SectionId>("top")

  useEffect(() => {
    const updateActiveSection = () => {
      const marker = window.scrollY + window.innerHeight * 0.36
      const result = document.getElementById("result")
      const planner = document.getElementById("planner")
      if (result && marker >= result.offsetTop) setActiveSection("result")
      else if (planner && marker >= planner.offsetTop) setActiveSection("planner")
      else setActiveSection("top")
    }

    updateActiveSection()
    window.addEventListener("scroll", updateActiveSection, { passive: true })
    return () => window.removeEventListener("scroll", updateActiveSection)
  }, [hasPlan])

  const goTo = (target: SectionId) => {
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" })
    setActiveSection(target)
  }

  return (
    <nav
      aria-label="주요 화면 이동"
      className="safe-bottom fixed inset-x-0 bottom-0 z-[70] px-4 pb-4 lg:hidden"
    >
      <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-white/94 p-2 shadow-[0_20px_55px_rgba(0,0,0,.16),0_5px_18px_rgba(0,0,0,.08)] backdrop-blur-2xl">
        <NavigationButton
          label="홈"
          icon={Home}
          active={activeSection === "top"}
          onClick={() => goTo("top")}
        />
        <NavigationButton
          label="조건"
          icon={SlidersHorizontal}
          active={activeSection === "planner"}
          onClick={() => goTo("planner")}
        />
        <NavigationButton
          label="코스"
          icon={Route}
          active={activeSection === "result"}
          disabled={!hasPlan}
          onClick={() => goTo("result")}
        />
        <button
          type="button"
          onClick={onSavedClick}
          className="relative grid size-12 place-items-center rounded-full bg-[#f1f1ef] text-black shadow-[inset_0_1px_0_white,0_8px_18px_rgba(0,0,0,.07)] outline-none transition hover:bg-[#e8e8e6] focus-visible:ring-[3px] focus-visible:ring-black/20 active:scale-95"
          aria-label={`저장한 코스 ${savedCount}개`}
        >
          <Bookmark className="size-[18px]" />
          {savedCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-black text-[9px] font-bold text-white">
              {savedCount}
            </span>
          ) : null}
        </button>
      </div>
    </nav>
  )
}

function NavigationButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string
  icon: typeof Home
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-12 items-center justify-center rounded-full outline-none transition-[width,background-color,color,box-shadow,transform] focus-visible:ring-[3px] focus-visible:ring-black/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35",
        active
          ? "w-[82px] gap-2 bg-black px-4 text-white shadow-[0_10px_24px_rgba(0,0,0,.2)]"
          : "w-12 bg-[#f1f1ef] text-black shadow-[inset_0_1px_0_white,0_8px_18px_rgba(0,0,0,.07)] hover:bg-[#e8e8e6]",
      )}
      aria-label={label}
    >
      <Icon className="size-[18px] shrink-0" />
      {active ? <span className="text-xs font-bold">{label}</span> : null}
    </button>
  )
}
