import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { loadFont } from "@remotion/google-fonts/Inter";

import { Scene1Problem } from "./scenes/Scene1Problem";
import { Scene2Solution } from "./scenes/Scene2Solution";
import { Scene3HowItWorks } from "./scenes/Scene3HowItWorks";
import { Scene4WhyItMatters } from "./scenes/Scene4WhyItMatters";
import { Scene5CTA } from "./scenes/Scene5CTA";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});

const SCENE_DURATION = 150; // 5 seconds at 30fps
const TRANSITION_DURATION = 25; // Slightly longer, smoother transitions

export const BingeItBroExplainer: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <TransitionSeries>
        {/* Scene 1: The Problem */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION}>
          <Scene1Problem />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Scene 2: The Solution */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION}>
          <Scene2Solution />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Scene 3: How It Works */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION}>
          <Scene3HowItWorks />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Scene 4: Why It Matters */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION}>
          <Scene4WhyItMatters />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION_DURATION })}
        />

        {/* Scene 5: Call to Action */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATION}>
          <Scene5CTA />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
