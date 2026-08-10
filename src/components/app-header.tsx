import { Bookmark, Database, MapPin } from "lucide-react"

import { BrandMark } from "@/components/brand-mark"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface AppHeaderProps {
  savedCount: number
  onSavedClick: () => void
}

export function AppHeader({ savedCount, onSavedClick }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/88 backdrop-blur-xl supports-[backdrop-filter]:bg-background/76">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" aria-label="ZERO TRIP 홈">
          <BrandMark />
        </a>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden h-8 gap-1.5 px-3 sm:inline-flex">
            <Database className="size-3.5 text-success-foreground" />
            공공데이터 샘플
          </Badge>
          <Badge variant="secondary" className="h-8 gap-1.5 px-3">
            <MapPin className="size-3.5" />
            서울 베타
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onSavedClick}
            aria-label={`저장한 코스 ${savedCount}개`}
            className="relative"
          >
            <Bookmark className="size-4" />
            {savedCount > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {savedCount}
              </span>
            ) : null}
          </Button>
        </div>
      </div>
    </header>
  )
}
