import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  History,
  MapPin,
  Salad,
  Sparkles,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PageContainer } from "../../components/layout/page-primitives";
import { demoMealSlots, demoNextMeal } from "./data/demo-data";
import { QueueInfoCard } from "./queue-info-card";
import { Reveal } from "../landing/landing-motion";

const nextMeal = demoMealSlots.find((slot) => slot.id === demoNextMeal.slotId);

export default function StudentDashboard() {
  return (
    <div className="student-page student-dashboard">
      <PageContainer>
        <Reveal className="student-page-heading student-page-heading--dashboard">
          <div>
            <span className="student-overline"><Sparkles size={14} aria-hidden="true" /> YOUR CAMPUS MEAL SPACE</span>
            <h1>Make your next meal <em>yours.</em></h1>
            <p>Plan ahead, see what information is available, and keep your meal details in one place.</p>
          </div>
          <Button href="/student/meals" size="large">Plan a meal <ArrowRight size={17} aria-hidden="true" /></Button>
        </Reveal>

        <div className="student-dashboard__grid">
          <Reveal className="student-next-meal student-panel" delay={0.05}>
            <div className="student-next-meal__photo">
              <Image src="/images/meal-bowl.jpg" alt="Illustrative rice and vegetable curry bowl." fill sizes="(max-width: 760px) 100vw, 64vw" />
              <span className="student-next-meal__image-label"><Salad size={14} aria-hidden="true" /> MEAL IDEA · DEMO</span>
            </div>
            <div className="student-next-meal__content">
              <div className="student-panel__topline">
                <span className="student-panel__eyebrow"><CalendarDays size={14} aria-hidden="true" /> NEXT MEAL</span>
                <Badge tone="lavender" dot>Demo schedule</Badge>
              </div>
              <div className="student-next-meal__details">
                <div><h2>{nextMeal.label}</h2><p>{demoNextMeal.dateLabel}</p></div>
                <span className="student-next-meal__slot-icon"><Clock3 size={19} aria-hidden="true" /></span>
              </div>
              <div className="student-next-meal__meta">
                <span><Clock3 size={15} aria-hidden="true" /> {demoNextMeal.window}</span>
                <span><MapPin size={15} aria-hidden="true" /> {demoNextMeal.mess}</span>
              </div>
              <div className="student-next-meal__menu">
                <span>MENU IDEAS</span>
                <p>{demoNextMeal.menuLabel}</p>
              </div>
              <Button href="/student/meals" variant="dark" fullWidth>Choose this meal <ArrowRight size={16} aria-hidden="true" /></Button>
            </div>
          </Reveal>

          <div className="student-dashboard__side">
            <Reveal delay={0.1}>
              <QueueInfoCard />
            </Reveal>

            <Reveal className="student-panel student-announcements" delay={0.14}>
              <div className="student-panel__topline">
                <span className="student-panel__eyebrow"><Bell size={14} aria-hidden="true" /> CAMPUS NOTES</span>
                <span className="student-announcements__spark" aria-hidden="true">✳</span>
              </div>
              <div className="student-empty-inline">
                <span className="student-empty-inline__icon"><Bell size={17} aria-hidden="true" /></span>
                <div><h2>No announcements connected</h2><p>Campus notes will show here when they’re available.</p></div>
              </div>
            </Reveal>
          </div>
        </div>

        <Reveal className="student-schedule-section" delay={0.08}>
          <div className="student-section-heading">
            <div><span className="student-overline">A LITTLE LOOK AHEAD</span><h2>Meal windows</h2></div>
            <Badge tone="neutral">Illustrative schedule</Badge>
          </div>
          <div className="student-meal-window-grid">
            {demoMealSlots.map((slot, index) => (
              <Link key={slot.id} href={`/student/meals?slot=${slot.id}`} className={`student-meal-window student-meal-window--${index}`}>
                <span className="student-meal-window__index">0{index + 1}</span>
                <span className="student-meal-window__text"><strong>{slot.label}</strong><small>{slot.window}</small></span>
                <ChevronRight size={17} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <p className="student-disclaimer">Sample schedule and menus for interface demonstration only. Campus availability has not been connected.</p>
        </Reveal>

        <Reveal className="student-history-nudge" delay={0.12}>
          <span className="student-history-nudge__icon"><History size={20} aria-hidden="true" /></span>
          <div><h2>Your meal history, when it’s ready.</h2><p>Past selections will appear here once real student records are connected.</p></div>
          <Link href="/student/history" className="student-text-link">View history <ArrowRight size={15} aria-hidden="true" /></Link>
        </Reveal>
      </PageContainer>
    </div>
  );
}
