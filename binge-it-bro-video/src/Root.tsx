import { Composition } from "remotion";
import { BingeItBroExplainer } from "./BingeItBroExplainer";
import { BingeItBroStory } from "./BingeItBroStory";
import { BingeItBro30 } from "./BingeItBro30";

// 5 scenes x 150 frames - 4 transitions x 25 frames = 650 frames (~21.7s at 30fps)
const TOTAL_DURATION = 650;
// 30 seconds: 5 scenes x 196 frames - 4 transitions x 20 frames = 900 frames
const THIRTY_SEC_DURATION = 900;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BingeItBro30"
        component={BingeItBro30}
        durationInFrames={THIRTY_SEC_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="BingeItBroExplainer"
        component={BingeItBroExplainer}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="BingeItBroStory"
        component={BingeItBroStory}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
