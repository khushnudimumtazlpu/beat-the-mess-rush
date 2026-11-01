import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  ClipboardList,
  Clock3,
  CookingPot,
  Leaf,
  LineChart,
  MapPin,
  MoveRight,
  Salad,
  ShieldCheck,
  Sparkles,
  Utensils,
  UsersRound,
} from "lucide-react";
import { AppShell } from "../../components/layout/app-shell";
import { PageContainer, PageSection, SectionHeading } from "../../components/layout/page-primitives";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PhotoFrame } from "./photo-frame";
import { QueueIllustration } from "./queue-illustration";
import { Reveal } from "./landing-motion";

const navigation = [
  { label: "Home", href: "/#top", isHome: true },
  { label: "Kitchen Portal", href: "/kitchen" },
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Impact", href: "#impact" },
];

const steps = [
  {
    number: "01",
    title: "Students plan a meal",
    description: "A meal choice and expected arrival time give the campus a clearer starting signal.",
    icon: Salad,
    tone: "lime",
  },
  {
    number: "02",
    title: "Demand comes together",
    description: "Selections can be summarized by mess, meal, and service window for staff review.",
    icon: ClipboardList,
    tone: "teal",
  },
  {
    number: "03",
    title: "Queue signals help students plan",
    description: "The queue module can share its current information with the student experience.",
    icon: Clock3,
    tone: "lavender",
  },
  {
    number: "04",
    title: "Kitchen teams review demand",
    description: "Expected meal demand can inform kitchen planning when that module is connected.",
    icon: CookingPot,
    tone: "coral",
  },
  {
    number: "05",
    title: "Staff record what was served",
    description: "Production, leftovers, and waste records make later analysis traceable.",
    icon: Utensils,
    tone: "teal",
  },
  {
    number: "06",
    title: "Admins review real records",
    description: "Analytics become meaningful once the underlying operational records exist.",
    icon: LineChart,
    tone: "lime",
  },
];

const dataReadiness = [
  { label: "Meal selections", status: "No student records connected", icon: ClipboardList },
  { label: "Queue estimates", status: "Queue module not connected", icon: Clock3 },
  { label: "Food-waste records", status: "Kitchen module active (demo)", icon: Leaf },
];

function HeroSection() {
  return (
    <section className="rush-hero" aria-labelledby="hero-title">
      <PageContainer className="rush-hero__grid">
        <Reveal className="rush-hero__copy">
          <div className="hero-kicker"><span className="hero-kicker__pulse" /> Campus dining, in better sync</div>
          <h1 id="hero-title" className="rush-hero__title">
            Make room for lunch.<br />
            <span>Lose the rush.</span>
          </h1>
          <p className="rush-hero__description">
            RushLess brings meal planning, queue information, and kitchen demand into one thoughtful campus dining experience.
          </p>
          <div className="rush-hero__actions">
            <Button href="/student" variant="primary" size="large">
              Open Student Dashboard <ArrowRight size={17} aria-hidden="true" />
            </Button>
            <Button href="/kitchen" variant="dark" size="large">
              Kitchen Portal <ArrowRight size={17} aria-hidden="true" />
            </Button>
            <Button href="/student/meals" variant="hero-outline" size="large">
              Plan a meal <ArrowDown size={16} aria-hidden="true" />
            </Button>
          </div>
          <div className="rush-hero__promise">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Clear about what is live, estimated, and still to come.</span>
          </div>
        </Reveal>

        <Reveal className="hero-art-wrap" delay={0.12}>
          <div className="hero-art" aria-label="Illustrative preview of campus dining tools with a meal photograph">
            <span className="hero-art__halo hero-art__halo--teal" aria-hidden="true" />
            <span className="hero-art__halo hero-art__halo--lime" aria-hidden="true" />
            <span className="hero-art__orbit" aria-hidden="true" />
            <div className="hero-art__dish">
              <PhotoFrame
                src="/images/hero-thali.jpg"
                alt="Overhead view of a colorful Indian thali with rice and several curries."
                priority
                sizes="(max-width: 760px) 90vw, 46vw"
                className="hero-art__photo"
              />
              <div className="hero-art__photo-caption">
                <span className="hero-art__caption-mark"><Utensils size={15} aria-hidden="true" /></span>
                <span><strong>A little more intention.</strong><small>Meal planning, made visual.</small></span>
              </div>
            </div>

            <div className="hero-art__meal-card">
              <span className="hero-art__meal-icon"><Salad size={17} aria-hidden="true" /></span>
              <span><strong>Plan your meal</strong><small>Choose a meal &amp; arrival window</small></span>
              <span className="hero-art__check"><Check size={14} aria-hidden="true" /></span>
            </div>

            <div className="hero-art__queue-card">
              <div className="hero-art__queue-heading">
                <span className="hero-art__queue-icon"><UsersRound size={16} aria-hidden="true" /></span>
                <span><strong>Queue preview</strong><small>Student-facing information</small></span>
                <Badge tone="lavender">Illustrative</Badge>
              </div>
              <div className="hero-art__queue-state">
                <span className="hero-art__queue-dot" />
                <span><strong>No live queue data</strong><small>Feed awaits Queue module integration</small></span>
              </div>
            </div>
            <span className="hero-art__asterisk hero-art__asterisk--one" aria-hidden="true">✳</span>
            <span className="hero-art__asterisk hero-art__asterisk--two" aria-hidden="true">✦</span>
            <div className="hero-art__micro-label"><MapPin size={13} aria-hidden="true" /> YOUR CAMPUS, ONE SHARED PICTURE</div>
          </div>
        </Reveal>
      </PageContainer>
      <div className="hero-bottom-rule" aria-hidden="true"><span /></div>
    </section>
  );
}

function StorySection() {
  return (
    <PageSection id="story" className="story-section">
      <PageContainer>
        <Reveal>
          <div className="story-heading-row">
            <SectionHeading
              eyebrow="The midday tangle"
              title={<>Three moving parts.<br /><span className="story-heading__accent">One shared meal.</span></>}
              description="Student plans, queue conditions, and kitchen preparation all shape the same lunch hour. RushLess is designed to help those signals meet."
            />
            <div className="story-heading-stamp" aria-hidden="true"><span>MEAL</span><span>TIME</span><span>↗</span></div>
          </div>
        </Reveal>

        <div className="friction-board">
          <Reveal className="friction-item friction-item--coral">
            <span className="friction-item__index">01 / ARRIVALS</span>
            <div className="friction-item__visual friction-item__visual--crowd"><UsersRound size={30} strokeWidth={1.6} /><span /><span /><span /></div>
            <h3>Unpredictable arrivals</h3>
            <p>Without a plan, it is harder to know when demand will bunch up.</p>
          </Reveal>
          <div className="friction-connector" aria-hidden="true"><MoveRight size={22} /></div>
          <Reveal className="friction-item friction-item--lavender" delay={0.08}>
            <span className="friction-item__index">02 / VISIBILITY</span>
            <div className="friction-item__visual friction-item__visual--queue"><span className="queue-line queue-line--one" /><span className="queue-line queue-line--two" /><span className="queue-line queue-line--three" /><span className="queue-pin"><MapPin size={17} /></span></div>
            <h3>Unclear queue picture</h3>
            <p>Students need trustworthy queue information before they can plan around it.</p>
          </Reveal>
          <div className="friction-connector" aria-hidden="true"><MoveRight size={22} /></div>
          <Reveal className="friction-item friction-item--teal" delay={0.16}>
            <span className="friction-item__index">03 / PREPARATION</span>
            <div className="friction-item__visual friction-item__visual--waste"><CookingPot size={31} strokeWidth={1.6} /><span className="waste-leaf"><Leaf size={17} /></span></div>
            <h3>Demand is hard to read</h3>
            <p>Kitchen teams need useful demand signals and records to review what was served.</p>
          </Reveal>
        </div>

        <Reveal className="story-bridge">
          <div className="story-bridge__icon"><Sparkles size={22} aria-hidden="true" /></div>
          <div><span className="eyebrow">A connected approach</span><h3>Give every meal a better handoff.</h3></div>
          <p>Start with student choices. Pass clear signals between modules. Let real records tell the story.</p>
          <Link href="#how-it-works" className="story-bridge__link" aria-label="See the RushLess workflow"><ArrowUpRight size={20} /></Link>
        </Reveal>
      </PageContainer>
    </PageSection>
  );
}

function StudentFeature() {
  return (
    <section id="student-experience" className="feature-block feature-block--student" aria-labelledby="student-feature-title">
      <PageContainer className="feature-block__grid">
        <Reveal className="feature-photo-stage feature-photo-stage--student">
          <PhotoFrame
            src="/images/meal-bowl.jpg"
            alt="A comforting rice bowl with vegetables and curry, photographed from above."
            sizes="(max-width: 760px) 92vw, 46vw"
            className="feature-photo feature-photo--student"
          />
          <div className="meal-note-card">
            <div className="meal-note-card__top"><span className="meal-note-card__icon"><Salad size={17} aria-hidden="true" /></span><Badge tone="teal">Illustrative UI</Badge></div>
            <strong>A plan that starts with you.</strong>
            <span>Meal choice <b>—</b></span>
            <span>Arrival window <b>—</b></span>
            <small>No menu or selection data is connected yet.</small>
          </div>
          <span className="feature-photo-stage__ring" aria-hidden="true" />
          <span className="feature-photo-stage__sun" aria-hidden="true">✳</span>
        </Reveal>
        <Reveal className="feature-copy feature-copy--student" delay={0.08}>
          <span className="feature-index">01 <span>STUDENT EXPERIENCE</span></span>
          <h2 id="student-feature-title">Your lunch,<br /><em>on your terms.</em></h2>
          <p>Plan a meal, choose a portion, and set an arrival window. See queue information in context when the queue team makes it available.</p>
          <ul className="feature-check-list">
            <li><span><Check size={13} /></span> A clear place to plan a meal</li>
            <li><span><Check size={13} /></span> Queue details with source and freshness</li>
            <li><span><Check size={13} /></span> Announcements and meal history</li>
          </ul>
          <Button href="/student" variant="dark">Open Student Dashboard <ArrowRight size={16} aria-hidden="true" /></Button>
          <Badge tone="neutral">Student module · planned</Badge>
        </Reveal>
      </PageContainer>
    </section>
  );
}

function QueueFeature() {
  return (
    <section id="queue-feature" className="feature-block feature-block--queue" aria-labelledby="queue-feature-title">
      <PageContainer className="feature-block__grid feature-block__grid--reverse">
        <Reveal className="feature-copy feature-copy--queue">
          <span className="feature-index">02 <span>QUEUE VISIBILITY</span></span>
          <h2 id="queue-feature-title">A clearer signal<br /><em>when it matters.</em></h2>
          <p>Queue Management is a separate team module. RushLess will show the information it provides, with its source and last-updated time, so students can judge how current it is.</p>
          <div className="queue-feature-status"><CircleHelp size={18} aria-hidden="true" /><span><strong>Not connected in this demo.</strong><small>No queue activity or wait estimate is being simulated.</small></span></div>
          <Badge tone="lavender">Queue module · integration boundary</Badge>
        </Reveal>
        <Reveal className="queue-feature-art" delay={0.1}>
          <QueueIllustration />
          <div className="queue-feature-art__note"><span className="queue-feature-art__note-dot" /><span>Data will appear here when available.</span></div>
        </Reveal>
      </PageContainer>
    </section>
  );
}

function KitchenFeature() {
  return (
    <section id="kitchen-feature" className="feature-block feature-block--kitchen" aria-labelledby="kitchen-feature-title">
      <PageContainer className="feature-block__grid">
        <Reveal className="feature-photo-stage feature-photo-stage--kitchen">
          <PhotoFrame
            src="/images/market-produce.jpg"
            alt="Fresh colorful vegetables arranged at a market produce stall."
            sizes="(max-width: 760px) 92vw, 46vw"
            className="feature-photo feature-photo--kitchen"
          />
          <div className="kitchen-image-tag"><Leaf size={15} aria-hidden="true" /><span>Preparation starts with a signal.</span></div>
          <div className="kitchen-image-orbit" aria-hidden="true"><span /><span /><span /></div>
        </Reveal>
        <Reveal className="feature-copy feature-copy--kitchen" delay={0.08}>
          <span className="feature-index">03 <span>KITCHEN &amp; WASTE INTELLIGENCE</span></span>
          <h2 id="kitchen-feature-title">Plan with care.<br /><em>Learn from every meal.</em></h2>
          <p>Kitchen Planning and Food-Waste Analytics remain Arman’s separate module. Shared demand and recorded kitchen data can support useful planning and honest review once connected.</p>
          <div className="kitchen-feature-pills"><span><CookingPot size={15} /> Demand planning</span><span><Leaf size={15} /> Recorded waste</span></div>
          <Badge tone="coral">Kitchen module · integration boundary</Badge>
        </Reveal>
      </PageContainer>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="features-section" aria-labelledby="features-title">
      <PageContainer>
        <Reveal className="features-intro">
          <SectionHeading
            eyebrow="One campus dining loop"
            title={<>Designed around the<br /><span>people behind each plate.</span></>}
            description="Three coordinated experiences share a common foundation while each team owns its workflows."
          />
          <div className="features-intro__aside"><span>STUDENT</span><MoveRight size={16} /><span>QUEUE</span><MoveRight size={16} /><span>KITCHEN</span></div>
        </Reveal>
      </PageContainer>
      <StudentFeature />
      <QueueFeature />
      <KitchenFeature />
    </section>
  );
}

function ProcessSection() {
  return (
    <PageSection id="how-it-works" className="process-section">
      <PageContainer>
        <Reveal className="process-heading-row">
          <SectionHeading
            eyebrow="A thoughtful handoff"
            title={<>From a student choice<br />to a better-informed kitchen.</>}
            description="RushLess connects a sequence of decisions and records. Each step belongs to the right campus team."
          />
          <div className="process-heading-mark"><span>THE</span><span>FLOW</span><ArrowDown size={17} /></div>
        </Reveal>
        <div className="process-timeline">
          <span className="process-timeline__rail" aria-hidden="true" />
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <Reveal key={step.number} className={`process-step process-step--${step.tone}`} delay={index * 0.045}>
                <div className="process-step__node"><span className="process-step__number">{step.number}</span><span className="process-step__icon"><Icon size={21} strokeWidth={1.8} aria-hidden="true" /></span></div>
                <div className="process-step__copy"><h3>{step.title}</h3><p>{step.description}</p></div>
              </Reveal>
            );
          })}
        </div>
        <Reveal className="process-footnote"><CircleHelp size={16} aria-hidden="true" /><span>Queue estimates and waste analytics are calculated within their owning modules and shown only when their data is available.</span></Reveal>
      </PageContainer>
    </PageSection>
  );
}

function ImpactSection() {
  return (
    <section id="impact" className="impact-section" aria-labelledby="impact-title">
      <PageContainer className="impact-section__grid">
        <Reveal className="impact-copy">
          <span className="eyebrow">Honest by design</span>
          <h2 id="impact-title">Good decisions<br />start with <em>good records.</em></h2>
          <p>RushLess will surface campus metrics only when they can be traced to real records. This preview contains no live campus data or claimed impact.</p>
          <div className="impact-pledge"><ShieldCheck size={18} aria-hidden="true" /><span>Every number will show where it came from.</span></div>
        </Reveal>
        <Reveal className="readiness-panel" delay={0.1}>
          <div className="readiness-panel__header"><span><span className="readiness-panel__spark">✳</span> DATA READINESS</span><Badge tone="neutral">Demo preview</Badge></div>
          <p className="readiness-panel__intro">Signals that will support meaningful campus insights:</p>
          <ul className="readiness-list">
            {dataReadiness.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <span className="readiness-list__icon"><Icon size={17} aria-hidden="true" /></span>
                  <span className="readiness-list__text"><strong>{item.label}</strong><small>{item.status}</small></span>
                  <span className="readiness-list__pending" aria-label="Pending integration"><span /></span>
                </li>
              );
            })}
          </ul>
          <div className="readiness-panel__footer"><span className="readiness-panel__footer-mark"><Check size={13} aria-hidden="true" /></span> No invented counts. No simulated live activity.</div>
        </Reveal>
      </PageContainer>
    </section>
  );
}

function ClosingSection() {
  return (
    <section className="closing-section">
      <PageContainer className="closing-card">
        <div className="closing-card__decor closing-card__decor--one" aria-hidden="true" />
        <div className="closing-card__decor closing-card__decor--two" aria-hidden="true" />
        <Reveal className="closing-card__content">
          <span className="eyebrow">A calmer campus meal starts here</span>
          <h2>Good food. Clearer flow.<br /><em>Room for everyone.</em></h2>
          <p>RushLess is a campus dining project built to connect student demand with the teams serving it.</p>
          <Button href="#how-it-works" variant="dark" size="large">Explore the RushLess flow <ArrowRight size={17} /></Button>
        </Reveal>
        <div className="closing-card__visual" aria-hidden="true">
          <span className="closing-card__plate closing-card__plate--back" />
          <span className="closing-card__plate closing-card__plate--front"><span /><span /><span /></span>
          <span className="closing-card__herb closing-card__herb--one">✳</span>
          <span className="closing-card__herb closing-card__herb--two">✦</span>
        </div>
      </PageContainer>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <PageContainer>
        <div className="site-footer__main">
          <div className="site-footer__brand">
            <Link className="site-footer__wordmark" href="#top"><span className="site-footer__brand-icon"><Utensils size={17} /></span>RushLess</Link>
            <p>Smart campus dining for a better-connected meal experience.</p>
            <span className="site-footer__project">P01 · Beat the Mess Rush</span>
          </div>
          <div className="site-footer__links-group"><strong>EXPLORE</strong><Link href="#story">The idea</Link><Link href="#features">What it connects</Link><Link href="#how-it-works">How it works</Link><Link href="#impact">Data &amp; impact</Link></div>
          <div className="site-footer__links-group"><strong>STUDENT DEMO</strong><Link href="/student">Student Dashboard</Link><Link href="/student/meals">Plan a Meal</Link><Link href="/student/history">Meal History</Link><Link href="#queue-feature">Queue visibility</Link><Link href="#kitchen-feature">Kitchen intelligence</Link></div>
          <div className="site-footer__links-group"><strong>KITCHEN PORTAL</strong><Link href="/kitchen">Kitchen Dashboard</Link><Link href="/kitchen/production">Production Log</Link><Link href="/kitchen/waste">Waste Log</Link><Link href="/kitchen/analytics">Waste Analytics</Link></div>
          <div className="site-footer__note"><span className="site-footer__note-icon"><ShieldCheck size={17} /></span><p>Information will be labelled by source: live, staff-reported, estimated, or demo.</p></div>
        </div>
        <div className="site-footer__bottom"><span>© 2026 RushLess · Campus dining project</span><span>Built around clearer handoffs, not made-up numbers.</span><Link href="#top">Back to top ↑</Link></div>
      </PageContainer>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <>
      <AppShell
        navItems={navigation}
        action={{ label: "Student dashboard", href: "/student", variant: "dark" }}
      >
        <div id="top" className="landing-page">
          <HeroSection />
          <StorySection />
          <FeaturesSection />
          <ProcessSection />
          <ImpactSection />
          <ClosingSection />
        </div>
      </AppShell>
      <SiteFooter />
    </>
  );
}
