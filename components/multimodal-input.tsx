"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import { CandlestickChart, CheckIcon, Sparkles } from "lucide-react";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Command,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  chatModels,
  DEFAULT_CHAT_MODEL,
  modelsByProvider,
} from "@/lib/ai/models";
import { fetchAllSymbols, type SymbolSearchItem } from "@/lib/tradingview/symbols";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useArtifact } from "@/hooks/use-artifact";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./elements/prompt-input";
import { ArrowUpIcon, PaperclipIcon, StopIcon } from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import { SuggestedActions } from "./suggested-actions";
import { Button } from "./ui/button";
import type { VisibilityType } from "./visibility-selector";

function setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  // biome-ignore lint/suspicious/noDocumentCookie: needed for client-side cookie setting
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}`;
}

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType,
  selectedModelId,
  onModelChange,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chartButtonRef = useRef<HTMLButtonElement>(null);
  const { width } = useWindowSize();
  const { setArtifact } = useArtifact();

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  const hasAutoFocused = useRef(false);
  useEffect(() => {
    if (!hasAutoFocused.current && width) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
        hasAutoFocused.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [width]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustHeight, localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const trimmedInput = input.trim();

  const openChartForSymbol = useCallback(
    (rawSymbol: string) => {
      const symbol = rawSymbol.trim().toUpperCase();
      if (!symbol) {
        toast.error("Enter a pair like BTC/USDT to show a chart");
        return;
      }

      const rect = chartButtonRef.current?.getBoundingClientRect();
      setInput(symbol);
      setArtifact((currentArtifact) => ({
        ...currentArtifact,
        documentId: "init",
        title: `Chart ${symbol}`,
        kind: "chart",
        content: symbol,
        isVisible: true,
        status: "idle",
        boundingBox:
          rect !== undefined
            ? {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }
            : currentArtifact.boundingBox,
      }));

      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    },
    [chartButtonRef, setArtifact, setInput]
  );

  const handleShowChart = useCallback(() => {
    openChartForSymbol(trimmedInput);
  }, [openChartForSymbol, trimmedInput]);

  const submitForm = useCallback(() => {
    window.history.pushState({}, "", `/chat/${chatId}`);

    sendMessage({
      role: "user",
      parts: [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          name: attachment.name,
          mediaType: attachment.contentType,
        })),
        {
          type: "text",
          text: input,
        },
      ],
    });

    setAttachments([]);
    setLocalStorageInput("");
    resetHeight();
    setInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    resetHeight,
  ]);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (_error) {
      toast.error("Failed to upload file, please try again!");
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error("Error uploading files!", error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length === 0) {
        return;
      }

      // Prevent default paste behavior for images
      event.preventDefault();

      setUploadQueue((prev) => [...prev, "Pasted image"]);

      try {
        const uploadPromises = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
          .map((file) => uploadFile(file));

        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) =>
            attachment !== undefined &&
            attachment.url !== undefined &&
            attachment.contentType !== undefined
        );

        setAttachments((curr) => [
          ...curr,
          ...(successfullyUploadedAttachments as Attachment[]),
        ]);
      } catch (error) {
        console.error("Error uploading pasted images:", error);
        toast.error("Failed to upload pasted image(s)");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  // Add paste event listener to textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
            sendMessage={sendMessage}
          />
        )}

      <input
        className="-top-4 -left-4 pointer-events-none fixed size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <PromptInput
        className="rounded-xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50"
        onSubmit={(event) => {
          event.preventDefault();
          if (status !== "ready") {
            toast.error("Please wait for the model to finish its response!");
          } else {
            submitForm();
          }
        }}
      >
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            className="flex flex-row items-end gap-2 overflow-x-scroll"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url)
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                attachment={{
                  url: "",
                  name: filename,
                  contentType: "",
                }}
                isUploading={true}
                key={filename}
              />
            ))}
          </div>
        )}
        <div className="flex flex-row items-start gap-1 sm:gap-2">
          <PromptInputTextarea
            className="grow resize-none border-0! border-none! bg-transparent p-2 text-base outline-none ring-0 [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden"
            data-testid="multimodal-input"
            disableAutoResize={true}
            maxHeight={200}
            minHeight={44}
            onChange={handleInput}
            placeholder="Send a message..."
            ref={textareaRef}
            rows={1}
            value={input}
          />
        </div>
        <PromptInputToolbar className="border-top-0! border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
          <PromptInputTools className="gap-0 sm:gap-0.5">
            <AttachmentsButton
              fileInputRef={fileInputRef}
              selectedModelId={selectedModelId}
              status={status}
            />
            <TokenPicker
              disabled={status !== "ready"}
              onSelectPair={openChartForSymbol}
            />
            <ChartButton
              disabled={!trimmedInput}
              onClick={handleShowChart}
              status={status}
              buttonRef={chartButtonRef}
            />
            <ModelSelectorCompact
              onModelChange={onModelChange}
              selectedModelId={selectedModelId}
            />
          </PromptInputTools>

          {status === "submitted" ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <PromptInputSubmit
              className="size-8 rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              data-testid="send-button"
              disabled={!input.trim() || uploadQueue.length > 0}
              status={status}
            >
              <ArrowUpIcon size={14} />
            </PromptInputSubmit>
          )}
        </PromptInputToolbar>
      </PromptInput>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const isReasoningModel =
    selectedModelId.includes("reasoning") || selectedModelId.includes("think");

  return (
    <Button
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="attachments-button"
      disabled={status !== "ready" || isReasoningModel}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

type TokenOption = Pick<SymbolSearchItem, "symbol" | "exchange">;

function TokenPicker({
  onSelectPair,
  disabled,
}: {
  onSelectPair: (symbol: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tokens, setTokens] = useState<TokenOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const featuredPairs = useMemo(
    () => ["BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT", "DOGE/USDT"],
    []
  );

  const loadTokens = useCallback(async () => {
    if (isLoading || tokens.length > 0) {
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const apiTokens = await fetchAllSymbols();
      const uniqueTokens = new Map<string, TokenOption>();
      for (const token of apiTokens) {
        if (!uniqueTokens.has(token.symbol)) {
          uniqueTokens.set(token.symbol, {
            symbol: token.symbol,
            exchange: token.exchange,
          });
        }
      }
      const sortedTokens = [...uniqueTokens.values()].sort((first, second) =>
        first.symbol.localeCompare(second.symbol)
      );
      setTokens(sortedTokens);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Unable to load tokens right now.";
      setError(message);
      toast.error("Could not fetch tokens from CryptoCompare.");
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, tokens.length]);

  useEffect(() => {
    if (open) {
      void loadTokens();
    }
  }, [loadTokens, open]);

  const filteredTokens = useMemo(() => {
    const safeQuery = query.trim().toLowerCase();
    if (!safeQuery) {
      return tokens.slice(0, 80);
    }

    const matches: TokenOption[] = [];
    for (const token of tokens) {
      const haystack = `${token.symbol} ${token.exchange}`.toLowerCase();
      if (haystack.includes(safeQuery)) {
        matches.push(token);
      }
      if (matches.length >= 120) {
        break;
      }
    }

    return matches;
  }, [query, tokens]);

  const handleSelect = useCallback(
    (pair: string) => {
      onSelectPair(pair);
      setQuery(pair);
      setOpen(false);
    },
    [onSelectPair]
  );

  return (
    <>
      <Button
        className="h-8 gap-2 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-amber-200/20 px-3 text-sm font-medium text-primary shadow-[0_0_0_1px_rgba(59,130,246,0.1)] transition-all hover:from-primary/20 hover:to-amber-200/30"
        disabled={disabled}
        onClick={() => setOpen(true)}
        type="button"
        variant="ghost"
      >
        <span className="hidden text-[11px] font-semibold uppercase tracking-wide text-primary sm:inline">
          Live
        </span>
        <Sparkles className="size-4 text-primary" />
        <span className="text-xs sm:text-sm">Pair finder</span>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <div className="space-y-2 border-b bg-gradient-to-r from-primary/10 via-background to-amber-400/15 px-4 py-3">
          <p className="text-sm font-semibold text-primary">
            CryptoCompare markets
          </p>
          <p className="text-sm text-muted-foreground">
            Search any trading pair and we will open the TradingView chart on
            selection.
          </p>
          <div className="flex flex-wrap gap-2">
            {featuredPairs.map((pair) => (
              <Button
                key={pair}
                className="border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary shadow-none transition-colors hover:bg-primary/20"
                onClick={() => handleSelect(pair)}
                type="button"
                variant="secondary"
              >
                {pair}
              </Button>
            ))}
          </div>
        </div>
        <Command className="border-0">
          <CommandInput
            autoFocus
            placeholder="Try BTC/USDT, ETH/USD, SOL/USDC..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {isLoading && (
              <CommandEmpty>Loading live markets…</CommandEmpty>
            )}
            {!isLoading && error !== null && (
              <CommandEmpty>{error}</CommandEmpty>
            )}
            {!isLoading && error === null && (
              <>
                <CommandEmpty>
                  No pairs match “{query || "your search"}”.
                </CommandEmpty>
                <CommandGroup heading="Markets">
                  {filteredTokens.map((token) => (
                    <CommandItem
                      key={`${token.symbol}-${token.exchange}`}
                      onSelect={() => handleSelect(token.symbol)}
                      value={token.symbol}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium leading-tight">
                          {token.symbol}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {token.exchange}
                        </span>
                      </div>
                      <Badge className="ml-auto rounded-full bg-emerald-500/10 text-[11px] font-semibold text-emerald-600 shadow-none dark:text-emerald-200">
                        Ready
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          <CommandSeparator />
          <div className="flex items-center justify-between px-4 py-3 text-[11px] text-muted-foreground">
            <span>Powered by CryptoCompare</span>
            <span>Enter to open chart</span>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}

function PureChartButton({
  onClick,
  status,
  disabled,
  buttonRef,
}: {
  onClick: () => void;
  status: UseChatHelpers<ChatMessage>["status"];
  disabled: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <Button
      aria-label="Show chart"
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="chart-button"
      disabled={disabled || status !== "ready"}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
      ref={buttonRef}
      type="button"
      variant="ghost"
    >
      <CandlestickChart className="h-3.5 w-3.5" />
    </Button>
  );
}

const ChartButton = memo(PureChartButton);

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectedModel =
    chatModels.find((m) => m.id === selectedModelId) ??
    chatModels.find((m) => m.id === DEFAULT_CHAT_MODEL) ??
    chatModels[0];
  const [provider] = selectedModel.id.split("/");

  // Provider display names
  const providerNames: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    xai: "xAI",
    reasoning: "Reasoning",
  };

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <Button className="h-8 w-[200px] justify-between px-2" variant="ghost">
          {provider && <ModelSelectorLogo provider={provider} />}
          <ModelSelectorName>{selectedModel.name}</ModelSelectorName>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          {Object.entries(modelsByProvider).map(
            ([providerKey, providerModels]) => (
              <ModelSelectorGroup
                heading={providerNames[providerKey] ?? providerKey}
                key={providerKey}
              >
                {providerModels.map((model) => {
                  const logoProvider = model.id.split("/")[0];
                  return (
                    <ModelSelectorItem
                      key={model.id}
                      onSelect={() => {
                        onModelChange?.(model.id);
                        setCookie("chat-model", model.id);
                        setOpen(false);
                      }}
                      value={model.id}
                    >
                      <ModelSelectorLogo provider={logoProvider} />
                      <ModelSelectorName>{model.name}</ModelSelectorName>
                      {model.id === selectedModel.id && (
                        <CheckIcon className="ml-auto size-4" />
                      )}
                    </ModelSelectorItem>
                  );
                })}
              </ModelSelectorGroup>
            )
          )}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="size-7 rounded-full bg-foreground p-1 text-background transition-colors duration-200 hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
