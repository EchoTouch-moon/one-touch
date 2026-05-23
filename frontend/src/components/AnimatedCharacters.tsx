import { useEffect, useRef, useState } from 'react';

interface CharacterPosition {
  faceX: number;
  faceY: number;
  bodySkew: number;
}

const neutralPosition: CharacterPosition = { faceX: 0, faceY: 0, bodySkew: 0 };

interface PupilProps {
  mouseX: number;
  mouseY: number;
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
}

function Pupil({ mouseX, mouseY, size = 12, maxDistance = 5, pupilColor = '#2D2D2D', forceLookX, forceLookY }: PupilProps) {
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pupilRef.current) return;
    if (forceLookX !== undefined && forceLookY !== undefined) {
      pupilRef.current.style.transform = `translate(${forceLookX}px, ${forceLookY}px)`;
      return;
    }

    const pupil = pupilRef.current.getBoundingClientRect();
    const pupilCenterX = pupil.left + pupil.width / 2;
    const pupilCenterY = pupil.top + pupil.height / 2;

    const deltaX = mouseX - pupilCenterX;
    const deltaY = mouseY - pupilCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);

    const angle = Math.atan2(deltaY, deltaX);
    pupilRef.current.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
  }, [mouseX, mouseY, forceLookX, forceLookY, maxDistance]);

  return (
    <div
      ref={pupilRef}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: pupilColor,
        borderRadius: '50%',
        transform: 'translate(0px, 0px)',
        transition: 'transform 0.1s ease-out',
      }}
    />
  );
}

interface EyeBallProps {
  mouseX: number;
  mouseY: number;
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
}

function EyeBall({
  mouseX,
  mouseY,
  size = 18,
  pupilSize = 7,
  maxDistance = 5,
  eyeColor = 'white',
  pupilColor = '#2D2D2D',
  isBlinking = false,
  forceLookX,
  forceLookY,
}: EyeBallProps) {
  const eyeRef = useRef<HTMLDivElement>(null);
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!eyeRef.current) return;
    if (!pupilRef.current) return;
    if (forceLookX !== undefined && forceLookY !== undefined) {
      pupilRef.current.style.transform = `translate(${forceLookX}px, ${forceLookY}px)`;
      return;
    }

    const eye = eyeRef.current.getBoundingClientRect();
    const eyeCenterX = eye.left + eye.width / 2;
    const eyeCenterY = eye.top + eye.height / 2;

    const deltaX = mouseX - eyeCenterX;
    const deltaY = mouseY - eyeCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);

    const angle = Math.atan2(deltaY, deltaX);
    pupilRef.current.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
  }, [mouseX, mouseY, forceLookX, forceLookY, maxDistance]);

  return (
    <div
      ref={eyeRef}
      style={{
        width: `${size}px`,
        height: isBlinking ? '2px' : `${size}px`,
        backgroundColor: eyeColor,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        transition: 'height 0.15s ease',
      }}
    >
      {!isBlinking ? (
        <div
          ref={pupilRef}
          style={{
            width: `${pupilSize}px`,
            height: `${pupilSize}px`,
            backgroundColor: pupilColor,
            borderRadius: '50%',
            transform: 'translate(0px, 0px)',
            transition: 'transform 0.1s ease-out',
          }}
        />
      ) : null}
    </div>
  );
}

interface AnimatedCharactersProps {
  isTyping?: boolean;
  isPasswordFocused?: boolean;
  showPassword?: boolean;
  passwordLength?: number;
}

export default function AnimatedCharacters({
  isTyping = false,
  isPasswordFocused = false,
  showPassword = false,
  passwordLength = 0,
}: AnimatedCharactersProps) {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [isPurpleBlinking, setIsPurpleBlinking] = useState(false);
  const [isBlackBlinking, setIsBlackBlinking] = useState(false);
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPurplePeeking, setIsPurplePeeking] = useState(false);
  const [positions, setPositions] = useState<Record<'purple' | 'black' | 'yellow' | 'orange', CharacterPosition>>({
    purple: neutralPosition,
    black: neutralPosition,
    yellow: neutralPosition,
    orange: neutralPosition,
  });

  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const run = () => {
      const t = setTimeout(() => {
        setIsPurpleBlinking(true);
        setTimeout(() => {
          setIsPurpleBlinking(false);
          run();
        }, 150);
      }, Math.random() * 4000 + 3000);
      return t;
    };
    const timeout = run();
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const run = () => {
      const t = setTimeout(() => {
        setIsBlackBlinking(true);
        setTimeout(() => {
          setIsBlackBlinking(false);
          run();
        }, 150);
      }, Math.random() * 4000 + 3000);
      return t;
    };
    const timeout = run();
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (isTyping) {
      const show = window.setTimeout(() => setIsLookingAtEachOther(true), 0);
      const timer = setTimeout(() => setIsLookingAtEachOther(false), 800);
      return () => {
        clearTimeout(show);
        clearTimeout(timer);
      };
    }
    const reset = window.setTimeout(() => setIsLookingAtEachOther(false), 0);
    return () => clearTimeout(reset);
  }, [isTyping]);

  useEffect(() => {
    if (passwordLength > 0 && showPassword) {
      const peek = setTimeout(() => {
        setIsPurplePeeking(true);
        setTimeout(() => setIsPurplePeeking(false), 800);
      }, Math.random() * 3000 + 2000);
      return () => clearTimeout(peek);
    }
    const reset = window.setTimeout(() => setIsPurplePeeking(false), 0);
    return () => clearTimeout(reset);
  }, [passwordLength, showPassword]);

  useEffect(() => {
    const calculatePosition = (ref: React.RefObject<HTMLDivElement | null>): CharacterPosition => {
      if (!ref.current) return neutralPosition;
      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 3;
      const deltaX = mouseX - centerX;
      const deltaY = mouseY - centerY;
      return {
        faceX: Math.max(-15, Math.min(15, deltaX / 20)),
        faceY: Math.max(-10, Math.min(10, deltaY / 30)),
        bodySkew: Math.max(-6, Math.min(6, -deltaX / 120)),
      };
    };

    const frame = window.requestAnimationFrame(() => {
      setPositions({
        purple: calculatePosition(purpleRef),
        black: calculatePosition(blackRef),
        yellow: calculatePosition(yellowRef),
        orange: calculatePosition(orangeRef),
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mouseX, mouseY]);

  const purplePos = positions.purple;
  const blackPos = positions.black;
  const yellowPos = positions.yellow;
  const orangePos = positions.orange;

  const isHidingPassword = passwordLength > 0 && !showPassword;
  const isLookingAway = isPasswordFocused && !showPassword;

  const getCharStyle = (
    backgroundColor: string,
    zIndex: number,
    pos: { faceX: number; faceY: number; bodySkew: number },
    dimensions: React.CSSProperties,
    transform?: string,
  ): React.CSSProperties => {
    const transformTransition =
      isPasswordFocused || isTyping ? 'transform 0.6s ease-out' : 'transform 0.1s ease-out';

    return {
      position: 'absolute',
      backgroundColor,
      zIndex,
      transformOrigin: 'bottom center',
      willChange: 'transform',
      backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
      transition: `${transformTransition}, height 0.6s ease-in-out`,
      transform: transform || `skewX(${pos.bodySkew || 0}deg) translateZ(0)`,
      bottom: '-2px',
      borderBottom: `4px solid ${backgroundColor}`,
      ...dimensions,
    };
  };

  return (
    <div style={{ position: 'relative', width: '550px', height: '400px', overflow: 'hidden' }}>
      {/* Purple character */}
      <div
        ref={purpleRef}
        style={getCharStyle(
          '#6C3FF5',
          1,
          purplePos,
          {
            left: '70px',
            width: '180px',
            height: isLookingAway || isTyping || isHidingPassword ? '440px' : '400px',
            borderRadius: '10px 10px 0 0',
          },
          passwordLength > 0 && showPassword
            ? 'skewX(0deg) translateZ(0)'
            : isLookingAway
              ? 'skewX(-14deg) translateX(-20px) translateZ(0)'
              : isTyping || isHidingPassword
                ? `skewX(${(purplePos.bodySkew || 0) - 12}deg) translateX(40px) translateZ(0)`
                : `skewX(${purplePos.bodySkew || 0}deg) translateZ(0)`,
        )}
      >
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            gap: '32px',
            left:
              isLookingAway
                ? '20px'
                : passwordLength > 0 && showPassword
                  ? '20px'
                  : isLookingAtEachOther
                    ? '55px'
                    : `${45 + purplePos.faceX}px`,
            top:
              isLookingAway
                ? '25px'
                : passwordLength > 0 && showPassword
                  ? '35px'
                  : isLookingAtEachOther
                    ? '65px'
                    : `${40 + purplePos.faceY}px`,
            transition: 'all 0.6s ease-out',
          }}
        >
          <EyeBall
            mouseX={mouseX}
            mouseY={mouseY}
            isBlinking={isPurpleBlinking}
            forceLookX={
              isLookingAway
                ? -5
                : passwordLength > 0 && showPassword
                  ? isPurplePeeking
                    ? 4
                    : -4
                  : isLookingAtEachOther
                    ? 3
                    : undefined
            }
            forceLookY={
              isLookingAway
                ? -5
                : passwordLength > 0 && showPassword
                  ? isPurplePeeking
                    ? 5
                    : -4
                  : isLookingAtEachOther
                    ? 4
                    : undefined
            }
          />
          <EyeBall
            mouseX={mouseX}
            mouseY={mouseY}
            isBlinking={isPurpleBlinking}
            forceLookX={
              isLookingAway
                ? -5
                : passwordLength > 0 && showPassword
                  ? isPurplePeeking
                    ? 4
                    : -4
                  : isLookingAtEachOther
                    ? 3
                    : undefined
            }
            forceLookY={
              isLookingAway
                ? -5
                : passwordLength > 0 && showPassword
                  ? isPurplePeeking
                    ? 5
                    : -4
                  : isLookingAtEachOther
                    ? 4
                    : undefined
            }
          />
        </div>
      </div>

      {/* Black character */}
      <div
        ref={blackRef}
        style={getCharStyle(
          '#2D2D2D',
          2,
          blackPos,
          {
            left: '240px',
            width: '120px',
            height: '310px',
            borderRadius: '8px 8px 0 0',
          },
          passwordLength > 0 && showPassword
            ? 'skewX(0deg) translateZ(0)'
            : isLookingAway
              ? 'skewX(12deg) translateX(-10px) translateZ(0)'
              : isLookingAtEachOther
                ? `skewX(${(blackPos.bodySkew || 0) * 1.5 + 10}deg) translateX(20px) translateZ(0)`
                : `skewX(${(blackPos.bodySkew || 0) * 1.5}deg) translateZ(0)`,
        )}
      >
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            gap: '24px',
            left:
              isLookingAway
                ? '10px'
                : passwordLength > 0 && showPassword
                  ? '10px'
                  : isLookingAtEachOther
                    ? '32px'
                    : `${26 + blackPos.faceX}px`,
            top:
              isLookingAway
                ? '20px'
                : passwordLength > 0 && showPassword
                  ? '28px'
                  : isLookingAtEachOther
                    ? '12px'
                    : `${32 + blackPos.faceY}px`,
            transition: 'all 0.6s ease-out',
          }}
        >
          <EyeBall
            mouseX={mouseX}
            mouseY={mouseY}
            size={16}
            pupilSize={6}
            isBlinking={isBlackBlinking}
            forceLookX={
              isLookingAway ? -4 : passwordLength > 0 && showPassword ? -4 : isLookingAtEachOther ? 0 : undefined
            }
            forceLookY={
              isLookingAway ? -5 : passwordLength > 0 && showPassword ? -4 : isLookingAtEachOther ? -4 : undefined
            }
          />
          <EyeBall
            mouseX={mouseX}
            mouseY={mouseY}
            size={16}
            pupilSize={6}
            isBlinking={isBlackBlinking}
            forceLookX={
              isLookingAway ? -4 : passwordLength > 0 && showPassword ? -4 : isLookingAtEachOther ? 0 : undefined
            }
            forceLookY={
              isLookingAway ? -5 : passwordLength > 0 && showPassword ? -4 : isLookingAtEachOther ? -4 : undefined
            }
          />
        </div>
      </div>

      {/* Orange character */}
      <div
        ref={orangeRef}
        style={getCharStyle(
          '#FF9B6B',
          3,
          orangePos,
          {
            left: '0px',
            width: '240px',
            height: '200px',
            borderRadius: '120px 120px 0 0',
          },
          passwordLength > 0 && showPassword
            ? 'skewX(0deg) translateZ(0)'
            : `skewX(${orangePos.bodySkew || 0}deg) translateZ(0)`,
        )}
      >
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            gap: '32px',
            left:
              isLookingAway
                ? '50px'
                : passwordLength > 0 && showPassword
                  ? '50px'
                  : `${82 + (orangePos.faceX || 0)}px`,
            top:
              isLookingAway
                ? '75px'
                : passwordLength > 0 && showPassword
                  ? '85px'
                  : `${90 + (orangePos.faceY || 0)}px`,
            transition: 'all 0.2s ease-out',
          }}
        >
          <Pupil
            mouseX={mouseX}
            mouseY={mouseY}
            forceLookX={isLookingAway ? -5 : passwordLength > 0 && showPassword ? -5 : undefined}
            forceLookY={isLookingAway ? -5 : passwordLength > 0 && showPassword ? -4 : undefined}
          />
          <Pupil
            mouseX={mouseX}
            mouseY={mouseY}
            forceLookX={isLookingAway ? -5 : passwordLength > 0 && showPassword ? -5 : undefined}
            forceLookY={isLookingAway ? -5 : passwordLength > 0 && showPassword ? -4 : undefined}
          />
        </div>
      </div>

      {/* Yellow character */}
      <div
        ref={yellowRef}
        style={getCharStyle(
          '#E8D754',
          4,
          yellowPos,
          {
            left: '310px',
            width: '140px',
            height: '230px',
            borderRadius: '70px 70px 0 0',
          },
          passwordLength > 0 && showPassword
            ? 'skewX(0deg) translateZ(0)'
            : `skewX(${yellowPos.bodySkew || 0}deg) translateZ(0)`,
        )}
      >
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            gap: '24px',
            left:
              isLookingAway
                ? '20px'
                : passwordLength > 0 && showPassword
                  ? '20px'
                  : `${52 + (yellowPos.faceX || 0)}px`,
            top:
              isLookingAway
                ? '30px'
                : passwordLength > 0 && showPassword
                  ? '35px'
                  : `${40 + (yellowPos.faceY || 0)}px`,
            transition: 'all 0.2s ease-out',
          }}
        >
          <Pupil
            mouseX={mouseX}
            mouseY={mouseY}
            forceLookX={isLookingAway ? -5 : passwordLength > 0 && showPassword ? -5 : undefined}
            forceLookY={isLookingAway ? -5 : passwordLength > 0 && showPassword ? -4 : undefined}
          />
          <Pupil
            mouseX={mouseX}
            mouseY={mouseY}
            forceLookX={isLookingAway ? -5 : passwordLength > 0 && showPassword ? -5 : undefined}
            forceLookY={isLookingAway ? -5 : passwordLength > 0 && showPassword ? -4 : undefined}
          />
        </div>
        {/* Yellow mouth */}
        <div
          style={{
            position: 'absolute',
            width: '80px',
            height: '4px',
            backgroundColor: '#2D2D2D',
            borderRadius: '999px',
            left:
              isLookingAway
                ? '15px'
                : passwordLength > 0 && showPassword
                  ? '10px'
                  : `${40 + (yellowPos.faceX || 0)}px`,
            top:
              isLookingAway
                ? '78px'
                : passwordLength > 0 && showPassword
                  ? '88px'
                  : `${88 + (yellowPos.faceY || 0)}px`,
            transition: 'all 0.2s ease-out',
          }}
        />
      </div>
    </div>
  );
}
