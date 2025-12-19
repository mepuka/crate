/**
 * ParallaxAlbumArt Component
 *
 * Apple Music-style depth effect with mouse/gyro tracking.
 * Creates subtle 3D parallax that responds to user interaction.
 *
 * Aesthetic: "Vinyl sleeve being tilted in record store light"
 * - Warm shadows
 * - Subtle highlight reflections
 * - Tactile, physical feel
 */

import { cn } from "@/lib/utils";
import {
  memo,
  useRef,
  useState,
  useCallback,
  useEffect,
  forwardRef,
} from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { AlbumArt } from "../AlbumArt";

// ============================================================================
// Types
// ============================================================================

interface ParallaxAlbumArtProps {
  src: string | null;
  alt: string;
  size?: number;
  className?: string;
  isNewMusic?: boolean;
  /** Parallax intensity (0-1, default 0.15) */
  intensity?: number;
  /** Enable gyroscope on mobile */
  enableGyro?: boolean;
  /** Enable reflection highlight */
  enableReflection?: boolean;
  /** Enable shadow depth */
  enableShadow?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const SPRING_CONFIG = {
  stiffness: 150,
  damping: 20,
  mass: 0.5,
};

// ============================================================================
// Component
// ============================================================================

export const ParallaxAlbumArt = memo(
  forwardRef<HTMLDivElement, ParallaxAlbumArtProps>(
    (
      {
        src,
        alt,
        size = 120,
        className,
        isNewMusic = false,
        intensity = 0.15,
        enableGyro = true,
        enableReflection = true,
        enableShadow = true,
      },
      ref
    ) => {
      const containerRef = useRef<HTMLDivElement>(null);
      const [isHovering, setIsHovering] = useState(false);

      // Motion values for smooth tracking
      const mouseX = useMotionValue(0);
      const mouseY = useMotionValue(0);

      // Spring smoothing
      const springX = useSpring(mouseX, SPRING_CONFIG);
      const springY = useSpring(mouseY, SPRING_CONFIG);

      // Transform to rotation
      const rotateX = useTransform(
        springY,
        [-0.5, 0.5],
        [intensity * 15, -intensity * 15]
      );
      const rotateY = useTransform(
        springX,
        [-0.5, 0.5],
        [-intensity * 15, intensity * 15]
      );

      // Highlight position (follows mouse)
      const highlightX = useTransform(springX, [-0.5, 0.5], ["30%", "70%"]);
      const highlightY = useTransform(springY, [-0.5, 0.5], ["30%", "70%"]);

      // Handle mouse move
      const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
          if (!containerRef.current) return;

          const rect = containerRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          // Normalize to -0.5 to 0.5 range
          const normalizedX = (e.clientX - centerX) / rect.width;
          const normalizedY = (e.clientY - centerY) / rect.height;

          mouseX.set(normalizedX);
          mouseY.set(normalizedY);
        },
        [mouseX, mouseY]
      );

      // Reset on mouse leave
      const handleMouseLeave = useCallback(() => {
        setIsHovering(false);
        mouseX.set(0);
        mouseY.set(0);
      }, [mouseX, mouseY]);

      // Gyroscope support for mobile
      useEffect(() => {
        if (!enableGyro || typeof window === "undefined") return;

        const handleOrientation = (e: DeviceOrientationEvent) => {
          if (e.gamma === null || e.beta === null) return;

          // gamma: left-right tilt (-90 to 90)
          // beta: front-back tilt (-180 to 180)
          const normalizedX = Math.max(-0.5, Math.min(0.5, e.gamma / 45));
          const normalizedY = Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 45));

          mouseX.set(normalizedX);
          mouseY.set(normalizedY);
        };

        // Request permission on iOS 13+
        if (
          typeof DeviceOrientationEvent !== "undefined" &&
          // @ts-expect-error - requestPermission is iOS-specific
          typeof DeviceOrientationEvent.requestPermission === "function"
        ) {
          // Permission needs to be requested on user gesture
          // This is handled separately, just set up the listener
        }

        window.addEventListener("deviceorientation", handleOrientation);
        return () =>
          window.removeEventListener("deviceorientation", handleOrientation);
      }, [enableGyro, mouseX, mouseY]);

      return (
        <div
          ref={ref}
          className={cn(
            "parallax-album-art",
            "relative inline-block",
            className
          )}
          style={{
            width: size,
            height: size,
            perspective: size * 4,
          }}
        >
          {/* Shadow layer */}
          {enableShadow && (
            <motion.div
              className="absolute inset-0 rounded-lg pointer-events-none"
              style={{
                rotateX,
                rotateY,
                transformStyle: "preserve-3d",
              }}
            >
              <div
                className="absolute inset-0 rounded-lg"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, transparent 70%)",
                  transform: "translateZ(-20px) translateY(8px) scale(0.95)",
                  filter: "blur(12px)",
                }}
              />
            </motion.div>
          )}

          {/* Main image container */}
          <motion.div
            ref={containerRef}
            className="relative w-full h-full rounded-lg overflow-hidden"
            style={{
              rotateX,
              rotateY,
              transformStyle: "preserve-3d",
            }}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={handleMouseLeave}
          >
            {/* Album art */}
            <AlbumArt
              src={src}
              alt={alt}
              size={size}
              isNewMusic={isNewMusic}
              className="w-full h-full"
            />

            {/* Reflection highlight overlay */}
            {enableReflection && (
              <motion.div
                className="absolute inset-0 pointer-events-none rounded-lg"
                style={{
                  background: `radial-gradient(
                    circle at ${highlightX} ${highlightY},
                    rgba(255, 255, 255, ${isHovering ? 0.15 : 0}) 0%,
                    transparent 50%
                  )`,
                  opacity: isHovering ? 1 : 0,
                  transition: "opacity 0.2s ease",
                }}
              />
            )}

            {/* Edge highlight (vinyl sleeve edge catch) */}
            <motion.div
              className="absolute inset-0 pointer-events-none rounded-lg"
              style={{
                background: `linear-gradient(
                  ${useTransform(springX, [-0.5, 0.5], [135, 45])}deg,
                  rgba(255, 255, 255, ${isHovering ? 0.08 : 0}) 0%,
                  transparent 30%,
                  transparent 70%,
                  rgba(0, 0, 0, ${isHovering ? 0.1 : 0}) 100%
                )`,
              }}
            />

            {/* Warm ambient glow (KEXP orange hint) */}
            {isNewMusic && (
              <div
                className="absolute -inset-2 -z-10 rounded-xl opacity-30 blur-xl pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle, hsl(28 90% 55% / 0.3) 0%, transparent 70%)",
                }}
              />
            )}
          </motion.div>
        </div>
      );
    }
  )
);

ParallaxAlbumArt.displayName = "ParallaxAlbumArt";
