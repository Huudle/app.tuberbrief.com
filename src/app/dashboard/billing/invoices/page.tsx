"use client";

import React from "react";
import { FileText, Receipt } from "lucide-react";
import { AppLayout } from "@/components/ui/app-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { Badge } from "@/components/ui/badge";
import { InvoiceResponse } from "@/app/api/billing/invoices/route";
import { supabaseAnon } from "@/lib/supabase";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaginationState {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export default function InvoicesPage() {
  const { profile: originalProfile, isLoading: profileLoading } = useProfile();
  const [isLoading, setIsLoading] = React.useState(true);
  const [invoices, setInvoices] = React.useState<InvoiceResponse[]>([]);
  const [invoiceError, setInvoiceError] = React.useState<string | null>(null);
  const [pagination, setPagination] = React.useState<PaginationState>({
    total: 0,
    page: 1,
    limit: 5,
    totalPages: 0,
    hasMore: false,
  });

  // Format date helper function
  const formatDate = (dateString: string | number) => {
    const date =
      typeof dateString === "number"
        ? new Date(dateString * 1000) // Convert Unix timestamp to date
        : new Date(dateString);

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

  // Format price helper function
  function formatPrice(amount: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  }

  // Function to handle page changes
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  // Function to handle page size changes
  const handlePageSizeChange = (newSize: string) => {
    setPagination((prev) => ({
      ...prev,
      limit: parseInt(newSize, 10),
      page: 1,
    }));
  };

  // Generate pagination items
  const generatePaginationItems = () => {
    const items = [];
    const maxVisiblePages = 5;
    const { page, totalPages } = pagination;

    if (totalPages <= maxVisiblePages) {
      // Show all pages if there are fewer than maxVisiblePages
      for (let i = 1; i <= totalPages; i++) {
        items.push(
          <PaginationItem key={i}>
            <PaginationLink
              onClick={() => handlePageChange(i)}
              isActive={page === i}
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
    } else {
      // Always show first page
      items.push(
        <PaginationItem key={1}>
          <PaginationLink
            onClick={() => handlePageChange(1)}
            isActive={page === 1}
          >
            1
          </PaginationLink>
        </PaginationItem>
      );

      // Calculate range of pages to show
      let startPage = Math.max(2, page - Math.floor(maxVisiblePages / 2));
      const endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 3);

      // Adjust if we're near the end
      if (endPage - startPage < maxVisiblePages - 3) {
        startPage = Math.max(2, endPage - (maxVisiblePages - 3));
      }

      // Show ellipsis if needed before middle pages
      if (startPage > 2) {
        items.push(
          <PaginationItem key="ellipsis-start">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }

      // Show middle pages
      for (let i = startPage; i <= endPage; i++) {
        items.push(
          <PaginationItem key={i}>
            <PaginationLink
              onClick={() => handlePageChange(i)}
              isActive={page === i}
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }

      // Show ellipsis if needed after middle pages
      if (endPage < totalPages - 1) {
        items.push(
          <PaginationItem key="ellipsis-end">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }

      // Always show last page
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink
            onClick={() => handlePageChange(totalPages)}
            isActive={page === totalPages}
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return items;
  };

  // Fetch invoices data when profile is loaded or pagination changes
  React.useEffect(() => {
    if (!originalProfile) return;

    let isMounted = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    async function fetchInvoices() {
      try {
        setIsLoading(true);
        console.log("Fetching invoices with pagination:", pagination);

        // Make sure we have the latest session
        const { data: sessionData, error: sessionError } =
          await supabaseAnon.auth.getSession();
        if (sessionError) {
          console.error("Session error:", sessionError);

          // If we get a session error, try to refresh the token
          if (retryCount < MAX_RETRIES) {
            const { error: refreshError } =
              await supabaseAnon.auth.refreshSession();
            if (refreshError) {
              throw new Error(
                "Unable to refresh authentication. Please log in again."
              );
            }
            retryCount++;
            if (isMounted) {
              // Wait a bit before retrying
              setTimeout(fetchInvoices, 1000);
            }
            return;
          }

          throw new Error(
            "Authentication required. Please refresh and try again."
          );
        }

        if (!sessionData.session) {
          throw new Error("No active session found. Please log in again.");
        }

        // Get the access token to use for the API request
        const accessToken = sessionData.session.access_token;
        console.log("Access token available:", !!accessToken);

        // Log the customer ID for debugging purposes
        console.log(
          "Customer ID:",
          originalProfile?.subscription?.stripe_customer_id || "None"
        );

        // Make the API request with the authorization header and pagination params
        const apiUrl = `/api/billing/invoices?page=${pagination.page}&limit=${pagination.limit}`;
        console.log("Fetching from API URL:", apiUrl);

        const response = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        console.log("API Response status:", response.status);

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Invoice API error:", errorData);

          // If we get a 401 error, try to refresh the token and retry
          if (response.status === 401 && retryCount < MAX_RETRIES) {
            const { error: refreshError } =
              await supabaseAnon.auth.refreshSession();
            if (refreshError) {
              throw new Error("Session expired. Please log in again.");
            }
            retryCount++;
            if (isMounted) {
              // Wait a bit before retrying
              setTimeout(fetchInvoices, 1000);
            }
            return;
          }

          throw new Error(errorData.error || "Failed to fetch invoices");
        }

        const responseData = await response.json();
        console.log("Full invoice API response:", responseData);

        if (isMounted) {
          if (responseData.invoices && responseData.invoices.length > 0) {
            setInvoices(responseData.invoices);
            console.log("Invoices set:", responseData.invoices.length);
          } else {
            console.log("No invoices found in response");
            setInvoices([]);
          }

          if (responseData.pagination) {
            // Ensure pagination values are valid before setting state
            const sanitizedPagination = {
              total: Math.max(0, responseData.pagination.total || 0),
              page: Math.max(1, responseData.pagination.page || 1),
              limit: Math.max(1, responseData.pagination.limit || 10),
              totalPages: Math.max(1, responseData.pagination.totalPages || 1),
              hasMore: !!responseData.pagination.hasMore,
            };

            console.log("Pagination from API:", responseData.pagination);
            console.log("Sanitized pagination:", sanitizedPagination);

            setPagination(sanitizedPagination);
          } else {
            console.log("No pagination data received, using fallback");
            // If no pagination data but we have invoices, create reasonable pagination data
            if (responseData.invoices && responseData.invoices.length > 0) {
              const fallbackPagination = {
                total: responseData.invoices.length,
                page: 1,
                limit: pagination.limit,
                totalPages: 1,
                hasMore: false,
              };
              setPagination(fallbackPagination);
            }
          }

          setInvoiceError(null);
        }
      } catch (error) {
        console.error("Error fetching invoices:", error);
        if (isMounted) {
          setInvoiceError(
            error instanceof Error
              ? error.message
              : "Failed to load invoices. Please try again."
          );
          setInvoices([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchInvoices();

    return () => {
      isMounted = false;
    };
  }, [originalProfile, pagination.page, pagination.limit]);

  if (profileLoading) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: "Billing", href: "/dashboard/billing" },
          { label: "Invoices", active: true },
        ]}
      >
        <div className="h-screen flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Billing", href: "/dashboard/billing" },
        { label: "Invoices", active: true },
      ]}
    >
      <div className="w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Billing Invoices</h1>
          <p className="text-sm text-muted-foreground">
            View and download your past invoices
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>
                History of payments for your subscription
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              {/* Page size selector */}
              {pagination.total > 0 && (
                <div className="flex items-center">
                  <span className="text-sm text-muted-foreground mr-2">
                    Show:
                  </span>
                  <Select
                    value={pagination.limit.toString()}
                    onValueChange={handlePageSizeChange}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue placeholder="10" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {invoiceError ? (
              <div className="py-8 text-center">
                <p className="text-destructive">{invoiceError}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {originalProfile?.subscription?.stripe_customer_id
                    ? "There was an error loading your invoices. Please try again later."
                    : "You don't have any active subscriptions yet."}
                </p>
              </div>
            ) : isLoading ? (
              <div className="h-screen flex items-center justify-center">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : invoices.length > 0 ? (
              <div className="space-y-4">
                <div className="rounded-md border">
                  <div className="grid grid-cols-4 bg-muted/50 p-3 text-sm font-medium">
                    <div>Date</div>
                    <div>Amount</div>
                    <div>Status</div>
                    <div className="text-right">Actions</div>
                  </div>
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="grid grid-cols-4 items-center p-3 text-sm border-t"
                    >
                      <div>{formatDate(invoice.date)}</div>
                      <div>{formatPrice(invoice.amount)}</div>
                      <div>
                        <Badge
                          variant={
                            invoice.status === "paid"
                              ? "default"
                              : "destructive"
                          }
                        >
                          {invoice.status === "paid" ? "Paid" : "Unpaid"}
                        </Badge>
                      </div>
                      <div className="text-right">
                        {invoice.invoice_url ? (
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={invoice.invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              View
                            </a>
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" disabled>
                            <FileText className="mr-2 h-4 w-4" />
                            View
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination UI */}
                {pagination.totalPages > 1 && (
                  <Pagination className="mt-4">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => handlePageChange(pagination.page - 1)}
                          aria-disabled={pagination.page === 1}
                          className={
                            pagination.page === 1
                              ? "pointer-events-none opacity-50"
                              : ""
                          }
                        />
                      </PaginationItem>

                      {generatePaginationItems()}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() => handlePageChange(pagination.page + 1)}
                          aria-disabled={
                            pagination.page === pagination.totalPages
                          }
                          className={
                            pagination.page === pagination.totalPages
                              ? "pointer-events-none opacity-50"
                              : ""
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}

                {/* Pagination info */}
                {pagination.total > 0 && (
                  <div className="text-sm text-muted-foreground text-center">
                    Showing{" "}
                    <span className="font-medium">
                      {(pagination.page - 1) * pagination.limit + 1}
                    </span>{" "}
                    to{" "}
                    <span className="font-medium">
                      {Math.min(
                        pagination.page * pagination.limit,
                        pagination.total
                      )}
                    </span>{" "}
                    of <span className="font-medium">{pagination.total}</span>{" "}
                    invoices
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Receipt className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                <p className="mt-4 text-muted-foreground">
                  {originalProfile?.subscription?.stripe_customer_id
                    ? "No invoices found for your account yet."
                    : "You don't have an active subscription yet."}
                </p>
                {originalProfile?.subscription?.stripe_customer_id && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Invoices will appear here after your first payment is
                    processed.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
