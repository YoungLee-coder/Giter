import type { ReactElement } from "react";
import { FolderGit2Icon } from "lucide-react";
import type { RemoteProvider } from "@/lib/tauri";
import { cn } from "@/lib/utils";

type IconProps = {
  className?: string;
};

function GithubIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect width="24" height="24" rx="5.5" fill="#fff" />
      <g transform="translate(12 12) scale(0.82) translate(-12 -12)">
        <path
          fill="#000"
          d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10Z"
        />
      </g>
    </svg>
  );
}

function GitlabIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="m23.955 13.587-1.34-4.122-2.66-8.19a.455.455 0 0 0-.867 0L16.43 9.463H7.572L4.913 1.275a.455.455 0 0 0-.867 0l-2.66 8.19-1.34 4.122a.924.924 0 0 0 .331 1.023L12 23.203l11.623-8.593a.92.92 0 0 0 .332-1.023" />
    </svg>
  );
}

function BitbucketIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M.778 1.213a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 0 0 .77-.646l3.27-20.03a.768.768 0 0 0-.768-.891zM14.52 15.53H9.522L8.17 8.466h7.561z" />
    </svg>
  );
}

function GiteaIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M4.5 14.5c1.8-3.2 4.2-5.8 7.5-7.8 1.2-.7 2.5-1.3 3.8-1.7.4-.1.7.3.5.7-.5 1.2-1.2 2.5-2.1 3.8C12.2 12.2 9.8 14.5 7 16.2c-.8.5-1.7.9-2.6 1.2-.5.2-.9-.3-.7-.8.3-.7.6-1.4.8-2.1z" />
      <path d="M15.8 4.2c.9-.2 1.8-.3 2.7-.2.5 0 .7.6.4.9-.8.9-1.7 1.7-2.7 2.4-.4.3-.9-.1-.8-.6.1-.8.3-1.7.4-2.5z" />
      <path d="M3.2 17.8c2.4-.1 4.7-.8 6.8-2 1.8-1 3.4-2.4 4.7-4 .3-.4.9-.2.9.3 0 2.2-.7 4.3-1.9 6.1-.4.6-1.2.4-1.4-.3-.3-1.1-.9-2.1-1.7-2.9-.9.9-2 1.5-3.2 1.9-1.3.4-2.7.7-4.1.8-.5 0-.6-.8-.1-.9z" />
    </svg>
  );
}

function CodebergIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M11.955.49A12 12 0 0 0 0 12.49a12 12 0 0 0 1.683 6.137 1.758 1.758 0 0 0 1.643.954h17.348a1.758 1.758 0 0 0 1.643-.954A12 12 0 0 0 24 12.49 12 12 0 0 0 11.955.49zm4.683 16.323h-9.25a.55.55 0 0 1-.5-.8l4.625-8.75a.55.55 0 0 1 1 0l4.625 8.75a.55.55 0 0 1-.5.8z" />
    </svg>
  );
}

function AzureIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M13.05 4.24 6.56 18.05 1.5 14.78 7.12 4.24zm.69 0 9.26 14.1-5.18-1.5-3.24-8.1zm-1.07 9.72 3.5 4.38H5.74z" />
    </svg>
  );
}

function OtherRemoteIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

const PROVIDER_ICONS: Record<RemoteProvider, (props: IconProps) => ReactElement> = {
  github: GithubIcon,
  gitlab: GitlabIcon,
  bitbucket: BitbucketIcon,
  gitea: GiteaIcon,
  codeberg: CodebergIcon,
  azure: AzureIcon,
  other: OtherRemoteIcon,
};

function resolveProviderIcon(
  provider: string | null | undefined,
): (props: IconProps) => ReactElement {
  if (!provider) {
    return ({ className }) => <FolderGit2Icon className={className} />;
  }
  return PROVIDER_ICONS[provider as RemoteProvider] ?? OtherRemoteIcon;
}

export function RemoteProviderIcon({
  provider,
  className,
}: {
  provider: string | null | undefined;
  className?: string;
}) {
  const Icon = resolveProviderIcon(provider);
  return <Icon className={cn("size-4", className)} />;
}
