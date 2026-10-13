/* eslint-disable react-hooks/set-state-in-effect */
// app/advertise/[mediaType]/in/[country]/[state]/page.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import BillboardFullCard from "@/app/components/billboard/BillboardFullCard";
import FilterSidebar from "@/app/components/billboard/FilterSidebar";
import SearchBox from "@/app/components/SearchBox";
import { useAssets } from "@/app/hooks/useAssets";
import { Billboard } from "@/app/types/billboard";
import Navbar from "@/app/components/layout/Navbar";
import Footer from "@/app/components/Home/Footer";
import SimilarMedia from "@/app/components/SimilarMedia";
import ResultsFilterBar from "@/app/components/ResultsFilterBar";
import { useCartDrawer } from "@/app/hooks/useCartDrawer";
import { billboardService } from "@/app/lib/billboard/billboard-service";
import PageBanner from "@/app/components/PageBanner";

type Filters = {
  mediaType: string;
  productType: string;
  location: string;
  minRate?: number;
  maxRate?: number;
  landmark: string;
  availability: "" | "available" | "booked" | "unavailable";
  targetAudience: string;
};

const formatDisplayText = (text: string) => {
  return text.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

const normalizeFilterText = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const getAvailabilityStatus = (
  item: any,
): "available" | "booked" | "unavailable" => {
  const explicitStatuses = [
    item.availabilityStatus,
    item.bookingStatus,
    item.status,
    typeof item.availability === "string" ? item.availability : undefined,
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value: string) => value.toLowerCase().replace(/[\s_-]+/g, " "));

  if (
    explicitStatuses.some((status) => ["booked", "reserved"].includes(status))
  ) {
    return "booked";
  }
  if (
    explicitStatuses.some((status) =>
      ["available", "available now", "active"].includes(status),
    )
  ) {
    return "available";
  }
  if (
    explicitStatuses.some((status) =>
      ["unavailable", "not available", "inactive"].includes(status),
    )
  ) {
    return "unavailable";
  }

  if (item.availability === true) return "available";
  if (item.availability === false) return "unavailable";

  const availableDate = item.availableDate
    ? new Date(item.availableDate)
    : null;
  if (
    availableDate &&
    !Number.isNaN(availableDate.getTime()) &&
    availableDate <= new Date()
  ) {
    return "available";
  }

  return "unavailable";
};

const matchesFilters = (item: any, filters: Filters) => {
  const rate = Number(item.rate ?? item.price ?? 0);
  const audienceValues = Array.isArray(item.targetAudience)
    ? item.targetAudience
    : item.targetAudience
      ? [item.targetAudience]
      : [];
  const normalizedAudience = audienceValues.map((value: string) =>
    String(value).toLowerCase(),
  );
  return (
    (!filters.mediaType ||
      normalizeFilterText(item.mediaType) ===
        normalizeFilterText(filters.mediaType)) &&
    (!filters.productType ||
      String(item.printProductType || "").toLowerCase() ===
        filters.productType.toLowerCase()) &&
    (!filters.location ||
      String(item.state || "").toLowerCase() ===
        filters.location.toLowerCase()) &&
    (filters.minRate === undefined || rate >= filters.minRate) &&
    (filters.maxRate === undefined || rate <= filters.maxRate) &&
    (!filters.landmark ||
      String(item.landmark || "")
        .toLowerCase()
        .includes(filters.landmark.toLowerCase())) &&
    (!filters.availability ||
      getAvailabilityStatus(item) === filters.availability) &&
    (!filters.targetAudience ||
      normalizedAudience.some((value: string) =>
        value.includes(filters.targetAudience.toLowerCase()),
      ))
  );
};

const getPriceRangeLabel = (filters: Filters) => {
  if (filters.minRate === undefined) return undefined;
  if (filters.maxRate === undefined) {
    return `₦${filters.minRate.toLocaleString()}+`;
  }
  return `₦${filters.minRate.toLocaleString()} - ₦${filters.maxRate.toLocaleString()}`;
};

export default function BillboardListingPage() {
  const params = useParams();
  const { mediaType, country, state } = params;

  const [mounted, setMounted] = useState(false);
  const { assets, isLoading: assetsLoading, getCitiesForState } = useAssets();
  const { open, openCart, closeCart } = useCartDrawer();

  // Initialize filters from URL parameters
  const [filters, setFilters] = useState<Filters>({
    mediaType: formatDisplayText(mediaType as string),
    productType: "",
    location: formatDisplayText(state as string),
    minRate: undefined,
    maxRate: undefined,
    landmark: "",
    availability: "",
    targetAudience: "",
  });

  const [results, setResults] = useState<Billboard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [availableCities, setAvailableCities] = useState<string[]>([]);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 6,
    total: 0,
    totalPages: 0,
  });

  // Use ref to track initial search
  const initialSearchDoneRef = useRef(false);
  const searchRequestIdRef = useRef(0);

  // Fix hydration - set mounted on client only
  useEffect(() => {
    setMounted(true);
  }, []);

  // Update cities when location (state) changes
  useEffect(() => {
    if (filters.location && assets.statesAndCites) {
      const cities = getCitiesForState(filters.location);
      setAvailableCities(cities);
    } else {
      setAvailableCities([]);
    }
  }, [filters.location, assets.statesAndCites, getCitiesForState]);

  const handleSearch = useCallback(
    async (page: number = 1, activeFilters: Filters = filters) => {
      if (!mounted) return;

      const requestId = ++searchRequestIdRef.current;
      setIsLoading(true);
      setHasSearched(true);

      try {
        const searchParams: any = {
          limit: 100,
          page: 1,
        };

        if (activeFilters.mediaType)
          searchParams.mediaType = activeFilters.mediaType;
        if (activeFilters.productType)
          searchParams.printProductType = activeFilters.productType;
        if (activeFilters.location) searchParams.state = activeFilters.location;
        if (activeFilters.minRate !== undefined)
          searchParams.minRate = activeFilters.minRate;
        if (activeFilters.maxRate !== undefined)
          searchParams.maxRate = activeFilters.maxRate;
        if (activeFilters.landmark)
          searchParams.landmark = activeFilters.landmark;
        if (activeFilters.availability) {
          searchParams.availability = activeFilters.availability;
        }
        if (activeFilters.targetAudience)
          searchParams.targetAudience = activeFilters.targetAudience;

        const response = await billboardService.searchBillboards(searchParams);
        if (requestId !== searchRequestIdRef.current) return;

        const fetchedResults = (response.foundItems || []).filter((item) =>
          matchesFilters(item, activeFilters),
        );

        const transformedResults: Billboard[] = fetchedResults.map(
          (item: any) => ({
            id: item._id,
            _id: item._id,
            title: `${item.mediaType || "Billboard"} at ${item.locationAddress || "Prime Location"}`,
            location: `${item.locationAddress}, ${item.city}, ${item.state}`,
            price: `₦${Number(item.rate ?? item.price ?? 0).toLocaleString()} / month`,
            image:
              item.photos?.[0] ||
              item.images?.[0] ||
              "/billboard-placeholder.jpg",
            size: `${item.height || 12}m x ${item.width || 24}m`,
            impressions: item.impressions
              ? `${Number(item.impressions).toLocaleString()} daily`
              : undefined,
            mediaType: item.mediaType,
            locationAddress: item.locationAddress,
            city: item.city,
            state: item.state,
            rate: item.rate,
            availableDate: item.availableDate,
            rating: item.rating,
            description: item.description,
            availableInDays: item.availableDate
              ? Math.max(
                  0,
                  Math.ceil(
                    (new Date(item.availableDate).getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24),
                  ),
                )
              : undefined,
            availabilityStatus: getAvailabilityStatus(item),
            availabilityLabel: (() => {
              const status = getAvailabilityStatus(item);
              if (status === "booked") return "Booked";

              const availableDate = item.availableDate
                ? new Date(item.availableDate)
                : null;
              if (
                availableDate &&
                !Number.isNaN(availableDate.getTime()) &&
                availableDate > new Date()
              ) {
                const daysUntilAvailable = Math.ceil(
                  (availableDate.getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24),
                );
                return `Available in ${daysUntilAvailable} day${daysUntilAvailable === 1 ? "" : "s"}`;
              }

              if (status === "available") return "Available";
              return "Unavailable";
            })(),
          }),
        );

        const totalPages = Math.ceil(
          transformedResults.length / pagination.limit,
        );
        setResults(
          transformedResults.slice(
            (page - 1) * pagination.limit,
            page * pagination.limit,
          ),
        );
        setPagination({
          page,
          limit: pagination.limit,
          total: transformedResults.length,
          totalPages,
        });
      } catch (error) {
        if (requestId !== searchRequestIdRef.current) return;
        console.error("Search failed:", error);
        setResults([]);
        setPagination({
          page: 1,
          limit: pagination.limit,
          total: 0,
          totalPages: 0,
        });
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [mounted, pagination.limit, filters],
  );

  const handleFilterChange = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      const newFilters = { ...filters, [key]: value };
      setFilters(newFilters);
      handleSearch(1, newFilters);
    },
    [filters, handleSearch],
  );

  const handleMediaTypeChange = useCallback(
    (mediaType: string, productType: string) => {
      const newFilters = { ...filters, mediaType, productType };
      setFilters(newFilters);
      handleSearch(1, newFilters);
    },
    [filters, handleSearch],
  );

  const handlePriceRangeChange = useCallback(
    (range: { minRate?: number; maxRate?: number }) => {
      const newFilters = { ...filters, ...range };
      setFilters(newFilters);
      handleSearch(1, newFilters);
    },
    [filters, handleSearch],
  );

  const handleResultChipChange = (filter: string) => {
    const availabilityOptions = {
      "Available Now": "available",
      Booked: "booked",
      Unavailable: "unavailable",
    } as const;
    if (filter in availabilityOptions) {
      const status =
        availabilityOptions[filter as keyof typeof availabilityOptions];
      handleFilterChange(
        "availability",
        filters.availability === status ? "" : status,
      );
      return;
    }
    if (filter === getPriceRangeLabel(filters)) {
      handlePriceRangeChange({});
    }
  };

  // Auto search when mounted
  useEffect(() => {
    if (
      mounted &&
      !assetsLoading &&
      filters.mediaType &&
      !initialSearchDoneRef.current
    ) {
      initialSearchDoneRef.current = true;
      handleSearch(1);
    }
  }, [mounted, assetsLoading, filters.mediaType, handleSearch]);

  const handlePageChange = (page: number) => {
    handleSearch(page);
    window.scrollTo({ top: 500, behavior: "smooth" });
  };

  // Get display names
  const getMediaTypeDisplay = () => {
    return filters.mediaType || formatDisplayText(mediaType as string);
  };

  const getStateDisplay = () => {
    return formatDisplayText(state as string);
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#F7F9FC]">
        <Navbar transparent />
        <div className="h-96 bg-gray-200 animate-pulse" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-[#F7F9FC] min-h-screen">
        <div className="fixed top-0 left-0 right-0 z-50">
          <Navbar transparent />
        </div>

        <PageBanner
          showHome
          title={`${getMediaTypeDisplay()} in ${getStateDisplay()}, Nigeria`}
          subtitle={`Find the best ${getMediaTypeDisplay()} advertising spaces in ${getStateDisplay()}`}
          breadcrumbs={[
            { label: "Advertise", href: "/advertise" },
            { label: getMediaTypeDisplay() },
            { label: "in" },
            { label: "Nigeria" },
            { label: getStateDisplay() },
          ]}
          backgroundImage="/images/board.jpg"
        />

        {/* Main Content */}
        <section className="pb-12 pt-14 bg-white px-4 sm:px-6 lg:px-18">
          {/* FLOATING SEARCH */}
          <div className="relative z-20">
            <SearchBox
              filters={filters}
              handleFilterChange={handleFilterChange}
              onMediaTypeChange={handleMediaTypeChange}
              handleSearch={() => handleSearch(1)}
              isLoading={isLoading}
              assets={assets}
              assetsLoading={assetsLoading}
              locations={Object.keys(assets.statesAndCites || {})}
            />
          </div>

          <div className="max-w-7xl mx-auto grid grid-cols-12 gap-6 mt-12">
            {/* Sidebar */}
            <div className="col-span-12 md:col-span-3">
              <FilterSidebar
                onFilterChange={handleFilterChange}
                onPriceRangeChange={handlePriceRangeChange}
                filters={filters}
                assets={assets}
              />
            </div>

            {/* Results Area */}
            <div className="col-span-12 md:col-span-9">
              <ResultsFilterBar
                title={getMediaTypeDisplay()}
                total={pagination.total}
                filters={[
                  "Available Now",
                  "Booked",
                  "Unavailable",
                  ...(getPriceRangeLabel(filters)
                    ? [getPriceRangeLabel(filters)!]
                    : []),
                ]}
                activeFilter={
                  filters.availability === "available"
                    ? "Available Now"
                    : filters.availability === "booked"
                      ? "Booked"
                      : filters.availability === "unavailable"
                        ? "Unavailable"
                        : ""
                }
                priceFilterLabel={getPriceRangeLabel(filters)}
                onFilterChange={handleResultChipChange}
                openCart={openCart}
                open={open}
                closeCart={closeCart}
              />

              {/* Loading Skeletons */}
              {isLoading && (
                <div className="space-y-6">
                  {Array.from({ length: pagination.limit }).map((_, i) => (
                    <div
                      key={i}
                      className="h-[180px] bg-gray-200 animate-pulse rounded-2xl"
                    />
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!isLoading && hasSearched && results.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-gray-500 text-lg">
                    No {getMediaTypeDisplay()} found in {getStateDisplay()}.
                  </p>
                  <button
                    onClick={() => {
                      setFilters({
                        mediaType: "",
                        productType: "",
                        location: "",
                        minRate: undefined,
                        maxRate: undefined,
                        landmark: "",
                        availability: "",
                        targetAudience: "",
                      });
                      initialSearchDoneRef.current = false;
                      handleSearch(1, {
                        mediaType: "",
                        productType: "",
                        location: "",
                        minRate: undefined,
                        maxRate: undefined,
                        landmark: "",
                        availability: "",
                        targetAudience: "",
                      });
                    }}
                    className="mt-6 text-[#0088b5] hover:underline font-medium"
                  >
                    Clear all filters
                  </button>
                </div>
              )}

              {/* Results */}
              {!isLoading && results.length > 0 && (
                <div className="space-y-6">
                  {results.map((board) => (
                    <BillboardFullCard key={board.id} billboard={board} />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {!isLoading && pagination.totalPages > 1 && (
                <div className="flex justify-center mt-10 gap-2 flex-wrap">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="px-4 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>

                  {Array.from(
                    { length: Math.min(5, pagination.totalPages) },
                    (_, i) => {
                      let pageNum;
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (pagination.page <= 3) {
                        pageNum = i + 1;
                      } else if (pagination.page >= pagination.totalPages - 2) {
                        pageNum = pagination.totalPages - 4 + i;
                      } else {
                        pageNum = pagination.page - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`px-4 py-2 rounded-lg text-sm border ${
                            pagination.page === pageNum
                              ? "bg-[#0177AB] text-white border-[#0177AB]"
                              : "bg-white hover:bg-gray-50"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    },
                  )}

                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    className="px-4 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <SimilarMedia />
      <Footer />
    </>
  );
}
