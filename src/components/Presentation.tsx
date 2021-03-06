import { Button, Overlay } from "@blueprintjs/core";
import marked from "roam-marked";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import Reveal from "reveal.js";
import { addStyle, isControl, resolveRefs } from "../entry-helpers";
import { isSafari } from "mobile-device-detect";

const SAFARI_THEMES = ["black", "white", "beige"];

export const VALID_THEMES = [
  ...SAFARI_THEMES,
  "league",
  "sky",
  "night",
  "serif",
  "simple",
  "solarized",
  "blood",
  "moon",
];

type ViewType = "bullet" | "document" | "numbered";

const renderViewType = (viewType: ViewType) => {
  switch (viewType) {
    case "document":
      return "";
    case "numbered":
      return "1. ";
    case "bullet":
    default:
      return "- ";
  }
};

const unload = () =>
  Array.from(window.roamjs.dynamicElements)
    .filter((s) => !!s.parentElement)
    .forEach((s) => s.parentElement.removeChild(s));

// I'll clean this up if anyone asks. My god it's horrendous
const renderBullet = ({
  c,
  i,
  parentViewType,
}: {
  c: Slide;
  i: number;
  parentViewType?: ViewType;
}): string =>
  `${"".padStart(i * 4, " ")}${
    c.text.match("!\\[.*\\]\\(.*\\)") ? "" : renderViewType(parentViewType)
  }${c.heading ? `${"".padStart(c.heading, "#")} ` : ""}${resolveRefs(c.text)}${
    c.open
      ? c.children
          .map(
            (nested) =>
              `\n${renderBullet({
                c: nested,
                i: parentViewType === "document" ? i : i + 1,
                parentViewType: c.viewType,
              })}`
          )
          .join("")
      : ""
  }`;

const Notes = ({ note }: { note?: Slide }) => (
  <>
    {note && (
      <aside
        className="notes"
        dangerouslySetInnerHTML={{
          __html: marked(renderBullet({ c: note, i: 0 })),
        }}
      />
    )}
  </>
);

type ImageFromTextProps = {
  text: string;
};

const IMG_REGEX = /!\[(.*)\]\((.*)\)/;

const ImageFromText: React.FunctionComponent<
  ImageFromTextProps & {
    Alt: React.FunctionComponent<ImageFromTextProps>;
  }
> = ({ text, Alt }) => {
  const imageMatch = text.match(IMG_REGEX);
  const [style, setStyle] = useState({});
  const imageRef = useRef(null);
  const imageOnLoad = useCallback(() => {
    const imageAspectRatio = imageRef.current.width / imageRef.current.height;
    const containerAspectRatio =
      imageRef.current.parentElement.offsetWidth /
      imageRef.current.parentElement.offsetHeight;
    if (!isNaN(imageAspectRatio) && !isNaN(containerAspectRatio)) {
      if (imageAspectRatio > containerAspectRatio) {
        setStyle({ width: "100%", height: "auto" });
      } else {
        setStyle({ height: "100%", width: "auto" });
      }
    }
  }, [setStyle, imageRef]);
  useEffect(() => {
    if (imageRef.current) {
      imageRef.current.onload = imageOnLoad;
    }
  }, [imageOnLoad, imageRef]);
  return imageMatch ? (
    <img alt={imageMatch[1]} src={imageMatch[2]} ref={imageRef} style={style} />
  ) : (
    <Alt text={text} />
  );
};

const TitleSlide = ({ text, note }: { text: string; note: Slide }) => {
  const style = IMG_REGEX.test(text) ? { bottom: 0 } : {};
  return (
    <section style={style}>
      <ImageFromText text={text} Alt={({ text }) => <h1>{text}</h1>} />
      <Notes note={note} />
    </section>
  );
};

const STARTS_WITH_IMAGE = new RegExp("^image ", "i");
const ENDS_WITH_LEFT = new RegExp(" left$", "i");

type ContentSlideExtras = { note: Slide; layout: string; collapsible: boolean };

const ContentSlide = ({
  text,
  children,
  note,
  layout,
  collapsible,
  viewType,
}: {
  text: string;
  children: Slides;
  viewType: ViewType;
} & ContentSlideExtras) => {
  const isImageLayout = STARTS_WITH_IMAGE.test(layout);
  const isLeftLayout = ENDS_WITH_LEFT.test(layout);
  const bullets = isImageLayout ? children.slice(1) : children;
  const slideRoot = useRef<HTMLDivElement>(null);
  const [caretsLoaded, setCaretsLoaded] = useState(false);
  useEffect(() => {
    if (collapsible && !caretsLoaded) {
      const lis = Array.from(slideRoot.current.getElementsByTagName("li"));
      let minDepth = Number.MAX_VALUE;
      lis.forEach((l) => {
        if (l.getElementsByTagName("ul").length) {
          const spanIcon = document.createElement("span");
          spanIcon.className =
            "bp3-icon bp3-icon-caret-right roamjs-collapsible-caret";
          l.style.position = "relative";
          l.insertBefore(spanIcon, l.childNodes[0]);
        }
        let depth = 0;
        let parentElement = l as HTMLElement;
        while (parentElement !== slideRoot.current) {
          parentElement = parentElement.parentElement;
          depth++;
        }
        minDepth = Math.min(minDepth, depth);
        l.setAttribute("data-dom-depth", depth.toString());
      });
      lis.forEach((l) => {
        const depth = parseInt(l.getAttribute("data-dom-depth"));
        if (depth === minDepth) {
          l.style.display = "list-item";
        } else {
          l.style.display = "none";
        }
      });
      setCaretsLoaded(true);
    }
  }, [collapsible, slideRoot.current, caretsLoaded, setCaretsLoaded]);
  const onRootClick = useCallback(
    (e: React.MouseEvent) => {
      if (collapsible) {
        const target = e.target as HTMLElement;
        const className = target.className;
        if (className.includes("roamjs-collapsible-caret")) {
          let minDepth = Number.MAX_VALUE;
          const lis = Array.from(
            target.parentElement.getElementsByTagName("li")
          );
          lis.forEach((l) => {
            const depth = parseInt(l.getAttribute("data-dom-depth"));
            minDepth = Math.min(depth, minDepth);
          });
          const lisToRestyle = lis.filter(
            (l) => parseInt(l.getAttribute("data-dom-depth")) === minDepth
          );
          if (className.includes("bp3-icon-caret-right")) {
            target.className = className.replace(
              "bp3-icon-caret-right",
              "bp3-icon-caret-down"
            );
            lisToRestyle.forEach((l) => (l.style.display = "list-item"));
          } else if (className.includes("bp3-icon-caret-down")) {
            target.className = className.replace(
              "bp3-icon-caret-down",
              "bp3-icon-caret-right"
            );
            lisToRestyle.forEach((l) => (l.style.display = "none"));
          }
        }
      }
    },
    [collapsible]
  );
  return (
    <section style={{ textAlign: "left" }}>
      <h1>{text}</h1>
      <div
        style={{
          display: "flex",
          flexDirection: isLeftLayout ? "row-reverse" : "row",
        }}
        className="r-stretch"
      >
        <div
          className={"roamjs-bullets-container"}
          dangerouslySetInnerHTML={{
            __html: marked(
              bullets
                .map((c) => renderBullet({ c, i: 0, parentViewType: viewType }))
                .join("\n")
            ),
          }}
          style={{
            width: isImageLayout ? "50%" : "100%",
            transformOrigin: "left top",
          }}
          ref={slideRoot}
          onClick={onRootClick}
        />
        {isImageLayout && (
          <div
            style={{ width: "50%", textAlign: "center", alignSelf: "center" }}
          >
            <ImageFromText text={children[0].text} Alt={() => <div />} />
          </div>
        )}
      </div>
      <Notes note={note} />
    </section>
  );
};

const observerCallback = (ms: MutationRecord[]) =>
  ms
    .map((m) => m.target as HTMLElement)
    .filter((m) => m.className === "present")
    .map(
      (s) =>
        s.getElementsByClassName(
          "roamjs-bullets-container"
        )[0] as HTMLDivElement
    )
    .filter((d) => !!d)
    .forEach((d) => {
      const containerHeight = d.offsetHeight;
      if (containerHeight > 0) {
        const contentHeight = (d.children[0] as HTMLElement).offsetHeight;
        if (contentHeight > containerHeight) {
          const scale = containerHeight / contentHeight;
          d.style.transform = `scale(${scale})`;
        } else {
          d.style.transform = "initial";
        }
      }
    });

const PresentationContent: React.FunctionComponent<{
  slides: Slides;
  showNotes: boolean;
  onClose: () => void;
}> = ({ slides, onClose, showNotes }) => {
  const revealRef = useRef(null);
  const slidesRef = useRef<HTMLDivElement>(null);
  const mappedSlides = slides.map((s) => {
    let layout = "default";
    let collapsible = false;
    const text = s.text
      .replace(new RegExp("{layout:(.*)}", "is"), (_, capture) => {
        layout = capture;
        return "";
      })
      .replace(new RegExp("{collapsible}", "i"), () => {
        collapsible = true;
        return "";
      })
      .trim();
    return {
      ...s,
      text,
      layout,
      collapsible,
      children: showNotes
        ? s.children.slice(0, s.children.length - 1)
        : s.children,
      note: showNotes && s.children[s.children.length - 1],
    };
  });
  useEffect(() => {
    const deck = new Reveal({
      embedded: true,
      slideNumber: "c/t",
      width: window.innerWidth * 0.9,
      height: window.innerHeight * 0.9,
      showNotes,
    });
    deck.initialize();
    revealRef.current = deck;
    const observer = new MutationObserver(observerCallback);
    observer.observe(slidesRef.current, {
      attributeFilter: ["class"],
      subtree: true,
    });
    return () => observer.disconnect();
  }, [revealRef, slidesRef]);
  const bodyEscapePrint = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (isControl(e) && e.key === "p" && !e.shiftKey && !e.altKey) {
        revealRef.current.isPrintingPdf = () => true;
        const injectedStyle = addStyle(`@media print {
  body * {
    visibility: hidden;
  }
  #roamjs-presentation-container #otherother * {
    visibility: visible;
  }
  #roamjs-presentation-container * {
    position: absolute;
    left: 0;
    top: 0;
  }
}`);
        const onAfterPrint = () => {
          injectedStyle.parentElement.removeChild(injectedStyle);
          window.removeEventListener("afterprint", onAfterPrint);
        };
        window.addEventListener("afterprint", onAfterPrint);
        window.print();
        e.preventDefault();
      }
    },
    [onClose]
  );
  useEffect(() => {
    document.body.addEventListener("keydown", bodyEscapePrint);
    return () => document.body.removeEventListener("keydown", bodyEscapePrint);
  }, [bodyEscapePrint]);
  return (
    <div className="reveal" id="otherother">
      <div className="slides" ref={slidesRef}>
        {mappedSlides.map((s: Slide & ContentSlideExtras, i) => (
          <React.Fragment key={i}>
            {s.children.length ? (
              <ContentSlide {...s} />
            ) : (
              <TitleSlide text={s.text} note={s.note} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

const Presentation: React.FunctionComponent<{
  getSlides: () => Slides;
  theme?: string;
  notes?: string;
}> = ({ getSlides, theme, notes }) => {
  const normalizedTheme = useMemo(
    () =>
      (isSafari ? SAFARI_THEMES : VALID_THEMES).includes(theme)
        ? theme
        : "black",
    []
  );
  const showNotes = notes === "true";
  const [showOverlay, setShowOverlay] = useState(false);
  const [slides, setSlides] = useState([]);
  const onClose = useCallback(() => {
    setShowOverlay(false);
    unload();
  }, [setShowOverlay]);

  const open = useCallback(async () => {
    setShowOverlay(true);
    setSlides(getSlides());
    Array.from(window.roamjs.dynamicElements)
      .filter(
        (s) =>
          s.id.endsWith(`${normalizedTheme}.css`) || s.id.endsWith("reveal.css")
      )
      .forEach((s) => document.head.appendChild(s));
  }, [setShowOverlay, normalizedTheme, getSlides, setSlides]);
  return (
    <>
      <Button onClick={open} data-roamjs-presentation text={"PRESENT"} />
      <Overlay canEscapeKeyClose onClose={onClose} isOpen={showOverlay}>
        <div
          style={{
            height: "100%",
            width: "100%",
            zIndex: 2000,
          }}
          id="roamjs-presentation-container"
        >
          <PresentationContent
            slides={slides}
            onClose={onClose}
            showNotes={showNotes}
          />
          <Button
            icon={"cross"}
            onClick={onClose}
            minimal
            style={{ position: "absolute", top: 8, right: 8 }}
          />
        </div>
      </Overlay>
    </>
  );
};

type Slide = {
  text: string;
  children: Slides;
  heading?: number;
  open: boolean;
  viewType: ViewType;
};

type Slides = Slide[];

export const render = ({
  button,
  getSlides,
  options,
}: {
  button: HTMLButtonElement;
  getSlides: () => Slides;
  options: { [key: string]: string };
}): void =>
  ReactDOM.render(
    <Presentation getSlides={getSlides} {...options} />,
    button.parentElement
  );

export default Presentation;
